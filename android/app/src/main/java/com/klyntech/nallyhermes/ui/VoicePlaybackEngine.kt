package com.klyntech.nallyhermes.ui

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Process
import android.util.Log
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * One AudioTrack and one writer thread for the whole call, instead of a new track for every reply.
 * The track is created (and warmed up) when the call becomes ready, so the first word of a reply starts
 * playing without an audio-system start-up delay, and replies play back to back without gaps or clicks.
 *
 * [interrupt] silences everything immediately (barge-in) and keeps the track alive for the next reply.
 * Stale audio is discarded by a generation counter, so a late chunk can never play after a barge-in.
 */
internal class VoicePlaybackEngine(
    /** All audio of the current reply has actually been played. Called from the writer thread. */
    private val onDrained: () -> Unit,
    /** Unrecoverable playback error. Called from the writer thread. */
    private val onFailure: (String) -> Unit
) {
    private sealed interface Item {
        class Pcm(val bytes: ByteArray, val generation: Int) : Item
        class EndOfTurn(val generation: Int) : Item
        data object Stop : Item
    }

    private val queue = LinkedBlockingQueue<Item>()
    private val lock = Any()
    private val queuedBytes = AtomicInteger(0)
    private val closed = AtomicBoolean(false)
    @Volatile private var generation = 0
    @Volatile private var track: AudioTrack? = null

    /** Creates the track and its writer thread if needed. Safe to call repeatedly. */
    fun ensureStarted(): Boolean = synchronized(lock) {
        if (closed.get()) return@synchronized false
        if (track != null) return@synchronized true
        try {
            val minimum = AudioTrack.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
            if (minimum <= 0) return@synchronized false
            val attributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            val format = AudioFormat.Builder()
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .build()
            val output = AudioTrack.Builder()
                .setAudioAttributes(attributes)
                .setAudioFormat(format)
                .setBufferSizeInBytes(maxOf(minimum * 2, 6_400))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
            if (output.state != AudioTrack.STATE_INITIALIZED) {
                output.release()
                return@synchronized false
            }
            output.play()
            track = output
            Thread({ runWriter(output) }, "nally-playback").apply { isDaemon = true }.start()
            true
        } catch (error: Exception) {
            Log.w(TAG, "Could not start playback", error)
            false
        }
    }

    /** Queues PCM16 audio. Returns false when the backlog is too large (the caller should drop the reply). */
    fun enqueue(bytes: ByteArray): Boolean = synchronized(lock) {
        if (closed.get()) return@synchronized true
        val total = queuedBytes.addAndGet(bytes.size)
        if (total > MAX_QUEUE_BYTES) {
            queuedBytes.addAndGet(-bytes.size)
            false
        } else {
            queue.offer(Item.Pcm(bytes, generation))
            true
        }
    }

    /** Marks the end of the current reply; [onDrained] fires once everything before it has played. */
    fun endOfTurn() {
        synchronized(lock) {
            if (!closed.get()) queue.offer(Item.EndOfTurn(generation))
        }
    }

    /** Barge-in: drop everything queued and silence the speaker at once. The track stays ready for the next reply. */
    fun interrupt() {
        synchronized(lock) {
            generation++
            val dropped = ArrayList<Item>()
            queue.drainTo(dropped)
            var bytes = 0
            for (item in dropped) if (item is Item.Pcm) bytes += item.bytes.size
            if (bytes > 0) queuedBytes.addAndGet(-bytes)
        }
        val output = track ?: return
        try {
            output.setVolume(0f) // mute first so the cut has no click
            output.pause()
            output.flush()
            output.setVolume(1f)
            output.play()
        } catch (error: Exception) {
            Log.w(TAG, "interrupt failed", error)
        }
    }

    fun release() {
        var output: AudioTrack? = null
        synchronized(lock) {
            if (!closed.compareAndSet(false, true)) return
            generation++
            queue.clear()
            queuedBytes.set(0)
            queue.offer(Item.Stop)
            output = track
            track = null
        }
        try {
            output?.pause()
            output?.flush()
            output?.stop()
            output?.release()
        } catch (_: Exception) { }
    }

    private fun runWriter(output: AudioTrack) {
        try { Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO) } catch (_: Exception) { }
        var framesWritten = 0L
        var seen = generation
        try {
            while (!closed.get()) {
                val item = queue.take()
                if (seen != generation) {
                    // A barge-in flushed the track, which also reset its playback position.
                    seen = generation
                    framesWritten = 0L
                }
                when (item) {
                    Item.Stop -> break
                    is Item.Pcm -> {
                        queuedBytes.addAndGet(-item.bytes.size)
                        if (item.generation != generation) continue
                        var offset = 0
                        // Short slices, so a barge-in stops the old reply within a few milliseconds.
                        while (offset < item.bytes.size && !closed.get() && item.generation == generation) {
                            val count = minOf(SLICE_BYTES, item.bytes.size - offset)
                            val written = output.write(item.bytes, offset, count, AudioTrack.WRITE_BLOCKING)
                            if (written < 0) throw IllegalStateException("Audio playback failed (status $written).")
                            if (written == 0) {
                                Thread.sleep(2L)
                                continue
                            }
                            offset += written
                            framesWritten += written / 2
                        }
                        if (item.generation != generation) {
                            seen = generation
                            framesWritten = 0L
                        }
                    }
                    is Item.EndOfTurn -> {
                        if (item.generation != generation) continue
                        // write() only queues PCM: wait until the speaker has actually played it.
                        while (!closed.get() && item.generation == generation && framesWritten > 0L) {
                            val played = output.playbackHeadPosition.toLong() and 0xffffffffL
                            if (played >= framesWritten) break
                            Thread.sleep(10L)
                        }
                        if (!closed.get() && item.generation == generation) onDrained()
                    }
                }
            }
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        } catch (error: Exception) {
            if (!closed.get()) onFailure(error.message ?: "Audio playback failed.")
        }
    }

    companion object {
        private const val TAG = "NallyPlayback"
        private const val SAMPLE_RATE = 16_000
        private const val SLICE_BYTES = 1_600 // 50 ms
        /** About 65 s of audio. The server paces replies to a few seconds ahead, so this is only a safety net. */
        const val MAX_QUEUE_BYTES = 2 * 1024 * 1024
    }
}
