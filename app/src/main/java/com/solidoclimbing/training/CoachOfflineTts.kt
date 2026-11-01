package com.solidoclimbing.training

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Offline Spanish (Spain) Piper voice for SOLIDO Coach.
 * Model files are downloaded and validated by the APK build workflow.
 */
class CoachOfflineTts(
    private val context: Context,
    private val onStatus: (String) -> Unit
) {
    private val worker = Executors.newSingleThreadExecutor()
    private val requestId = AtomicLong(0)
    @Volatile private var engine: OfflineTts? = null
    @Volatile private var currentTrack: AudioTrack? = null
    private val released = AtomicBoolean(false)

    private fun createEngine(): OfflineTts {
        engine?.let { return it }
        val dir = "vits-piper-es_ES-davefx-medium"
        val config = OfflineTtsConfig(
            model = OfflineTtsModelConfig(
                vits = OfflineTtsVitsModelConfig(
                    model = "$dir/es_ES-davefx-medium.onnx",
                    tokens = "$dir/tokens.txt",
                    dataDir = "$dir/espeak-ng-data"
                ),
                numThreads = 2,
                debug = false,
                provider = "cpu"
            )
        )
        return OfflineTts(assetManager = context.assets, config = config).also { engine = it }
    }

    private fun splitText(text: String, maxChars: Int = 220): List<String> {
        val sentences = text.split(Regex("(?<=[.!?])\\s+")).filter { it.isNotBlank() }
        val chunks = mutableListOf<String>()
        var current = StringBuilder()
        for (sentence in sentences) {
            var remaining = sentence.trim()
            while (remaining.length > maxChars) {
                val splitAt = remaining.lastIndexOf(' ', maxChars).takeIf { it > maxChars / 2 } ?: maxChars
                val piece = remaining.substring(0, splitAt).trim()
                if (piece.isNotEmpty()) chunks += piece
                remaining = remaining.substring(splitAt).trim()
            }
            if (remaining.isNotEmpty()) {
                if (current.isNotEmpty() && current.length + remaining.length + 1 > maxChars) {
                    chunks += current.toString()
                    current = StringBuilder()
                }
                if (current.isNotEmpty()) current.append(' ')
                current.append(remaining)
            }
        }
        if (current.isNotEmpty()) chunks += current.toString()
        return chunks
    }

    fun speak(text: String) {
        if (released.get()) return
        val clean = text.trim().take(1800)
        if (clean.isEmpty()) {
            onStatus("error")
            return
        }
        val id = requestId.incrementAndGet()
        stopTrack()
        try {
            worker.execute {
                var track: AudioTrack? = null
                var totalSamplesPlayed = 0L
                try {
                    val tts = createEngine()
                    val chunks = splitText(clean)
                    for (chunk in chunks) {
                        if (id != requestId.get() || released.get()) break
                        val audio = tts.generate(chunk, sid = 0, speed = 0.96f)
                        if (id != requestId.get()) break
                        if (audio.samples.isEmpty()) continue

                        if (track == null) {
                            val minBytes = AudioTrack.getMinBufferSize(
                                audio.sampleRate,
                                AudioFormat.CHANNEL_OUT_MONO,
                                AudioFormat.ENCODING_PCM_16BIT
                            )
                            if (minBytes <= 0) throw IllegalStateException("AudioTrack no admite PCM16")
                            val createdTrack = AudioTrack.Builder()
                                .setAudioAttributes(
                                    AudioAttributes.Builder()
                                        .setUsage(AudioAttributes.USAGE_MEDIA)
                                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                        .build()
                                )
                                .setAudioFormat(
                                    AudioFormat.Builder()
                                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                                        .setSampleRate(audio.sampleRate)
                                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                                        .build()
                                )
                                .setBufferSizeInBytes(maxOf(minBytes * 2, 16 * 1024))
                                .setTransferMode(AudioTrack.MODE_STREAM)
                                .build()
                            track = createdTrack
                            if (createdTrack.state != AudioTrack.STATE_INITIALIZED) {
                                throw IllegalStateException("No se pudo inicializar la salida de audio")
                            }
                            currentTrack = createdTrack
                            createdTrack.play()
                            if (createdTrack.playState != AudioTrack.PLAYSTATE_PLAYING) {
                                throw IllegalStateException("AudioTrack no ha iniciado la reproducción")
                            }
                            onStatus("started")
                        }

                        val activeTrack = track ?: throw IllegalStateException("AudioTrack no disponible")
                        val pcm = ShortArray(audio.samples.size) { index ->
                            (audio.samples[index].coerceIn(-1.0f, 1.0f) * Short.MAX_VALUE).toInt().toShort()
                        }
                        var offset = 0
                        while (offset < pcm.size && id == requestId.get()) {
                            val count = minOf(2048, pcm.size - offset)
                            val written = activeTrack.write(pcm, offset, count, AudioTrack.WRITE_BLOCKING)
                            if (written <= 0) throw IllegalStateException("AudioTrack no pudo escribir el audio: $written")
                            offset += written
                        }
                        totalSamplesPlayed += pcm.size
                        // Keep only one short PCM chunk in memory at a time. This avoids large
                        // native/heap allocations on phones when a long coaching paragraph is read.
                        while (id == requestId.get() &&
                            activeTrack.playbackHeadPosition.toLong() < totalSamplesPlayed) {
                            Thread.sleep(30)
                        }
                    }
                    if (id == requestId.get() && !released.get()) onStatus("done")
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    if (id == requestId.get() && !released.get()) onStatus("error")
                } catch (_: Throwable) {
                    if (id == requestId.get() && !released.get()) onStatus("error")
                } finally {
                    try {
                        track?.let {
                            if (it.state == AudioTrack.STATE_INITIALIZED) {
                                if (it.playState == AudioTrack.PLAYSTATE_PLAYING) it.pause()
                                it.flush()
                                it.stop()
                            }
                            it.release()
                        }
                    } catch (_: Throwable) {
                        // AudioTrack can already be stopped by a concurrent stop request.
                    }
                    if (currentTrack === track) currentTrack = null
                }
            }
        } catch (_: RejectedExecutionException) {
            // Activity may be closing while WebView finishes a queued JS call.
        }
    }

    fun stop() {
        requestId.incrementAndGet()
        stopTrack()
    }

    private fun stopTrack() {
        val track = currentTrack ?: return
        try {
            if (track.state == AudioTrack.STATE_INITIALIZED) {
                if (track.playState == AudioTrack.PLAYSTATE_PLAYING) track.pause()
                track.flush()
                track.stop()
            }
        } catch (_: Throwable) {
            // The worker will release the track in its finally block.
        }
    }

    fun release() {
        if (!released.compareAndSet(false, true)) return
        stop()
        try {
            worker.execute {
                try { engine?.release() } catch (_: Throwable) {}
                engine = null
            }
        } catch (_: RejectedExecutionException) {
            // The worker has already shut down; there is no active request to retain.
        }
        worker.shutdown()
    }
}
