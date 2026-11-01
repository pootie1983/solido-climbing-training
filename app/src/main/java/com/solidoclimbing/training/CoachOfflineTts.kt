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
                try {
                    val audio = createEngine().generate(clean, sid = 0, speed = 0.96f)
                    if (id != requestId.get() || audio.samples.isEmpty()) return@execute

                    val pcm = ShortArray(audio.samples.size) { index ->
                        (audio.samples[index].coerceIn(-1.0f, 1.0f) * Short.MAX_VALUE).toInt().toShort()
                    }
                    val minBytes = AudioTrack.getMinBufferSize(
                        audio.sampleRate,
                        AudioFormat.CHANNEL_OUT_MONO,
                        AudioFormat.ENCODING_PCM_16BIT
                    )
                    if (minBytes <= 0) throw IllegalStateException("AudioTrack no admite PCM16")

                    track = AudioTrack.Builder()
                        .setAudioAttributes(
                            AudioAttributes.Builder()
                                // Use the normal media stream so the phone's media-volume control
                                // governs the coach voice consistently on Samsung devices.
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
                    if (track.state != AudioTrack.STATE_INITIALIZED) {
                        throw IllegalStateException("No se pudo inicializar la salida de audio")
                    }
                    currentTrack = track
                    if (id != requestId.get()) return@execute

                    track.play()
                    if (track.playState != AudioTrack.PLAYSTATE_PLAYING) {
                        throw IllegalStateException("AudioTrack no ha iniciado la reproducción")
                    }
                    onStatus("started")

                    var offset = 0
                    while (offset < pcm.size && id == requestId.get()) {
                        val count = minOf(4096, pcm.size - offset)
                        val written = track.write(pcm, offset, count, AudioTrack.WRITE_BLOCKING)
                        if (written <= 0) throw IllegalStateException("AudioTrack no pudo escribir el audio: $written")
                        offset += written
                    }
                    while (id == requestId.get() && track.playbackHeadPosition < pcm.size) {
                        Thread.sleep(40)
                    }
                    if (id == requestId.get()) onStatus("done")
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    if (id == requestId.get()) onStatus("error")
                } catch (_: Throwable) {
                    if (id == requestId.get()) onStatus("error")
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
