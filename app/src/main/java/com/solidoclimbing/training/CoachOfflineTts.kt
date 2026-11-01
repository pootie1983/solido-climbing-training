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
        val clean = text.trim().take(1800)
        if (clean.isEmpty()) {
            onStatus("error")
            return
        }
        val id = requestId.incrementAndGet()
        stopTrack()
        worker.execute {
            try {
                val audio = createEngine().generate(clean, sid = 0, speed = 0.96f)
                if (id != requestId.get() || audio.samples.isEmpty()) return@execute
                val minBytes = AudioTrack.getMinBufferSize(
                    audio.sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_FLOAT
                )
                if (minBytes <= 0) throw IllegalStateException("AudioTrack no admite el formato de voz")
                val track = AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                            .setSampleRate(audio.sampleRate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build()
                    )
                    .setBufferSizeInBytes(maxOf(minBytes, audio.samples.size * 4))
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .build()
                currentTrack = track
                val written = track.write(audio.samples, 0, audio.samples.size, AudioTrack.WRITE_BLOCKING)
                if (written < 0) throw IllegalStateException("No se pudo preparar el audio")
                if (id != requestId.get()) {
                    track.release()
                    return@execute
                }
                onStatus("started")
                track.play()
                while (id == requestId.get() && track.playbackHeadPosition < audio.samples.size) {
                    Thread.sleep(40)
                }
                track.stop()
                track.release()
                if (currentTrack === track) currentTrack = null
                if (id == requestId.get()) onStatus("done")
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                if (id == requestId.get()) onStatus("error")
            } catch (_: Throwable) {
                stopTrack()
                if (id == requestId.get()) onStatus("error")
            }
        }
    }

    fun stop() {
        requestId.incrementAndGet()
        stopTrack()
    }

    private fun stopTrack() {
        val track = currentTrack
        currentTrack = null
        try {
            if (track != null) {
                if (track.playState == AudioTrack.PLAYSTATE_PLAYING) track.pause()
                track.flush()
                track.stop()
                track.release()
            }
        } catch (_: Throwable) {
            // The track may already have completed or been released by the worker.
        }
    }

    fun release() {
        stop()
        worker.execute {
            try { engine?.release() } catch (_: Throwable) {}
            engine = null
        }
        worker.shutdown()
    }
}
