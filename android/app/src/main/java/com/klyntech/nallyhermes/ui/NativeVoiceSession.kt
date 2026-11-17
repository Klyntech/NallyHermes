package com.klyntech.nallyhermes.ui

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONObject
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** One call owns its socket and audio resources. Protocol v1 uses mono pcm_s16le at 16 kHz. */
internal class NativeVoiceSession(
    private val context: Context,
    private val websocketUrl: String,
    private val callback: (Event) -> Unit
) {
    sealed interface Event {
        data object Connected : Event
        data class State(val state: VoiceUiState) : Event
        data class Caption(val text: String, val final: Boolean) : Event
        data class Error(val message: String) : Event
        data object Ended : Event
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val stopped = AtomicBoolean(false)
    @Volatile private var muted = false
    @Volatile private var socket: WebSocket? = null
    @Volatile private var startSent = false
    @Volatile private var phase = "init"
    @Volatile private var lastServerError: String? = null
    @Volatile private var recorder: AudioRecord? = null
    @Volatile private var track: AudioTrack? = null
    private var captureJob: Job? = null
    private var playbackJob: Job? = null
    private val playbackChunks = LinkedBlockingQueue<ByteArray>(24)
    private var audioFocusRequest: AudioFocusRequest? = null

    fun connect() {
        callback(Event.State(VoiceUiState.Connecting))
        val request = Request.Builder().url(websocketUrl).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                // A screen/lifecycle cancellation can happen while OkHttp is still connecting.
                // Never enqueue an application-level close before the protocol start message.
                if (stopped.get()) {
                    webSocket.close(1000, "cancelled before start")
                    return
                }
                phase = "socket_open"
                callback(Event.Connected)
                val sent = webSocket.send(JSONObject().put("type", "start").put("protocolVersion", 1).toString())
                if (sent) {
                    startSent = true
                    phase = "start_sent"
                } else {
                    callback(Event.Error("Could not send the voice start message to the server."))
                    stop("start send failed")
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleControl(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                if (stopped.get()) return
                val chunk = bytes.toByteArray()
                if (chunk.isEmpty() || chunk.size % 2 != 0) {
                    callback(Event.Error("The voice server sent an invalid PCM audio frame."))
                    stop("invalid audio frame")
                    return
                }
                if (!playbackChunks.offer(chunk)) {
                    callback(Event.Error("Audio playback fell behind the live response."))
                    stop("playback backpressure")
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (stopped.get()) return
                val status = response?.code
                val body = try { response?.body?.string()?.take(240) } catch (_: Exception) { null }
                val message = when {
                    status == 401 -> "Voice ticket rejected (login expired or ticket already used). Pair again or retry Start."
                    status == 403 -> "Voice connection blocked by the server (origin or policy)."
                    status == 429 -> "A voice call is already active. End it and try again."
                    status == 503 -> body?.takeIf { it.contains("voice", ignoreCase = true) }
                        ?: "Realtime voice is not enabled or the server is at capacity. Check VOICE_ENABLED on the backend."
                    !body.isNullOrBlank() -> {
                        // Prefer JSON {"error":"..."} from rejectUpgrade
                        val extracted = try {
                            val o = org.json.JSONObject(body)
                            o.optString("error").ifBlank { o.optString("message") }
                        } catch (_: Exception) { body }
                        extracted.ifBlank { t.message ?: "Voice connection failed." }
                    }
                    !t.message.isNullOrBlank() -> t.message!!
                    else -> "Voice connection failed (network or TLS)."
                }
                callback(Event.Error(message))
                cleanup()
                callback(Event.Ended)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                val priorError = lastServerError
                cleanup()
                if (priorError == null && phase != "ready" && phase != "server_error") {
                    val detail = buildString {
                        append("Call dropped during '")
                        append(phase)
                        append("' (WS ")
                        append(code)
                        if (reason.isNotBlank()) {
                            append(": ")
                            append(reason.take(80))
                        }
                        append(").")
                    }
                    callback(Event.Error(detail))
                }
                callback(Event.Ended)
            }
        })
    }

    private fun handleControl(raw: String) {
        val event = try { JSONObject(raw) } catch (_: Exception) {
            callback(Event.Error("The voice server sent an invalid control message."))
            return
        }
        when (event.optString("type")) {
            "hello" -> {
                phase = "hello"
                val stt = event.optBoolean("sttConfigured", true)
                val tts = event.optBoolean("ttsConfigured", true)
                if (!stt) {
                    lastServerError = "Server is missing DEEPGRAM_API_KEY."
                    callback(Event.Error(lastServerError!!))
                    stop("stt unconfigured")
                    return
                }
                if (!tts) {
                    lastServerError = "Server is missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID."
                    callback(Event.Error(lastServerError!!))
                    stop("tts unconfigured")
                    return
                }
            }
            "ready" -> {
                phase = "ready"
                val input = event.optJSONObject("input")
                if (event.optInt("protocolVersion") != 1 || input == null || input.optString("encoding") != "pcm_s16le" ||
                    input.optInt("sampleRate") != 16_000 || input.optInt("channels") != 1) {
                    callback(Event.Error("The server requested an unsupported microphone format."))
                    stop("unsupported format")
                    return
                }
                if (!requestAudioFocus()) {
                    callback(Event.Error("Audio focus is unavailable."))
                    stop("audio focus")
                    return
                }
                callback(Event.State(VoiceUiState.Listening))
                startCapture()
            }
            "transcript" -> {
                callback(Event.Caption(event.optString("text"), event.optBoolean("final")))
                callback(Event.State(VoiceUiState.Listening))
            }
            "assistant_start" -> callback(Event.State(VoiceUiState.Thinking))
            "text_delta" -> callback(Event.Caption(event.optString("text"), true))
            "audio_start" -> {
                if (event.optString("encoding") != "pcm_s16le" || event.optInt("sampleRate") != 16_000 || event.optInt("channels") != 1) {
                    callback(Event.Error("The voice server requested an unsupported playback format."))
                    stop("unsupported playback format")
                } else {
                    if (!startPlayback()) {
                        callback(Event.Error("Audio playback could not be initialized."))
                        stop("playback initialization")
                    } else callback(Event.State(VoiceUiState.Speaking))
                }
            }
            "audio_end" -> {
                // Empty frame is a drain marker; the playback worker switches back to listening only
                // after all PCM already received has reached AudioTrack.
                if (!playbackChunks.offer(ByteArray(0))) {
                    callback(Event.Error("Audio playback fell behind the live response."))
                    stop("playback backpressure")
                }
            }
            "assistant_end" -> Unit
            "interrupted" -> {
                clearPlayback()
                callback(Event.State(VoiceUiState.Interrupted))
            }
            "pong" -> Unit
            "error" -> {
                val message = event.optString("message").ifBlank {
                    event.optString("code").ifBlank { "Voice service error." }
                }
                lastServerError = message
                phase = "server_error"
                callback(Event.Error(message))
                stop(message)
            }
        }
    }

    private fun requestAudioFocus(): Boolean = try {
        if (Build.VERSION.SDK_INT >= 26) {
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setOnAudioFocusChangeListener { change ->
                    if (change <= AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                        socket?.send(JSONObject().put("type", "interrupt").toString())
                        clearPlayback()
                        callback(Event.State(VoiceUiState.Interrupted))
                    } else if (change == AudioManager.AUDIOFOCUS_GAIN) callback(Event.State(VoiceUiState.Listening))
                }.build()
            audioFocusRequest = request
            audioManager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
    } catch (_: Exception) { false }

    private fun startCapture() {
        if (captureJob != null || stopped.get()) return
        val minimum = AudioRecord.getMinBufferSize(16_000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minimum <= 0) { callback(Event.Error("This device cannot capture 16 kHz mono audio.")); stop("capture unsupported"); return }
        try {
            val record = AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, 16_000,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minimum, 6_400))
            if (record.state != AudioRecord.STATE_INITIALIZED) {
                record.release(); callback(Event.Error("Microphone could not be initialized.")); stop("mic initialization"); return
            }
            recorder = record
            record.startRecording()
            captureJob = CoroutineScope(Dispatchers.IO).launch {
                val frame = ByteArray(3_200) // 100 ms, safely below the server's 32 KB frame cap
                try {
                    while (!stopped.get() && record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                        val count = record.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING)
                        if (count > 0) {
                            val ws = socket ?: break
                            if (ws.queueSize() < 256 * 1024) {
                                val outgoing = frame.copyOf(count)
                                if (muted) outgoing.fill(0)
                                ws.send(ByteString.of(*outgoing))
                            }
                        }
                    }
                } catch (error: Exception) {
                    if (!stopped.get()) callback(Event.Error(error.message ?: "Microphone capture failed."))
                }
            }
        } catch (error: SecurityException) {
            callback(Event.Error("Microphone permission is required.")); stop("permission")
        } catch (error: Exception) {
            callback(Event.Error(error.message ?: "Could not start microphone capture.")); stop("capture failed")
        }
    }

    private fun startPlayback(): Boolean {
        if (stopped.get()) return false
        try {
            track?.let { try { it.stop(); it.release() } catch (_: Exception) { } }
            playbackJob?.cancel()
            playbackChunks.clear()
            val minimum = AudioTrack.getMinBufferSize(16_000, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
            if (minimum <= 0) return false
            val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
            val format = AudioFormat.Builder().setSampleRate(16_000).setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT).build()
            val output = AudioTrack.Builder().setAudioAttributes(attributes).setAudioFormat(format)
                .setBufferSizeInBytes(maxOf(minimum * 2, 6_400)).setTransferMode(AudioTrack.MODE_STREAM).build()
            if (output.state != AudioTrack.STATE_INITIALIZED) { output.release(); return false }
            output.play()
            track = output
            playbackJob = CoroutineScope(Dispatchers.IO).launch {
                try {
                    while (!stopped.get()) {
                        val chunk = playbackChunks.take()
                        if (chunk.isEmpty()) {
                            callback(Event.State(VoiceUiState.Listening))
                            continue
                        }
                        var offset = 0
                        while (offset < chunk.size && !stopped.get()) {
                            val written = output.write(chunk, offset, chunk.size - offset, AudioTrack.WRITE_BLOCKING)
                            if (written <= 0) throw IllegalStateException("AudioTrack could not play the response.")
                            offset += written
                        }
                    }
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                } catch (error: Exception) {
                    if (!stopped.get()) callback(Event.Error(error.message ?: "Audio playback failed."))
                }
            }
            return true
        } catch (_: Exception) { return false }
    }

    private fun clearPlayback() {
        playbackChunks.clear()
        try { track?.pause(); track?.flush() } catch (_: Exception) { }
    }

    fun setMuted(value: Boolean) { muted = value }

    fun stop(reason: String = "user ended") {
        if (!stopped.compareAndSet(false, true)) return
        val ws = socket
        // OkHttp queues send() calls made before onOpen. Sending "close" while connecting
        // can therefore reach the server before "start" and trigger start_required.
        if (startSent) ws?.send(JSONObject().put("type", "close").toString())
        ws?.close(1000, reason.take(120))
        cleanup()
    }

    private fun cleanup() {
        if (!stopped.get()) stopped.set(true)
        captureJob?.cancel(); captureJob = null
        playbackJob?.cancel(); playbackJob = null
        try { recorder?.let { if (it.recordingState == AudioRecord.RECORDSTATE_RECORDING) it.stop(); it.release() } } catch (_: Exception) { }
        recorder = null
        try { track?.pause(); track?.flush(); track?.release() } catch (_: Exception) { }
        track = null
        playbackChunks.clear()
        if (Build.VERSION.SDK_INT >= 26) audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }
        audioFocusRequest = null
    }
}
