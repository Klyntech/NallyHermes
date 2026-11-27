package com.klyntech.nallyhermes.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import com.klyntech.nallyhermes.MobileApi
import com.klyntech.nallyhermes.VoiceCallService
import com.klyntech.nallyhermes.WakeWordService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Owns the one live voice call for the whole process. The screen only observes it, so the call keeps
 * running when you switch tabs, lock the phone or leave the app (a foreground service holds the
 * microphone), and it reconnects by itself after a network drop.
 *
 * Everything here runs on the main thread.
 */
internal object VoiceCallManager {
    var state by mutableStateOf(VoiceUiState.Ready)
        private set
    var caption by mutableStateOf<String?>(null)
        private set
    var audioLevel by mutableFloatStateOf(0f)
        private set
    var muted by mutableStateOf(false)
        private set
    /** True when the "Start" gate should be shown (no call and none starting). */
    var gateVisible by mutableStateOf(true)
        private set
    var notice by mutableStateOf<String?>(null)
        private set
    var starting by mutableStateOf(false)
        private set
    var session by mutableStateOf<NativeVoiceSession?>(null)
        private set

    private class Attempt {
        var reachedListening = false
        var error: NativeVoiceSession.Event.Error? = null
    }

    private const val MAX_RECONNECTS = 3
    private val main = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var api: MobileApi? = null
    private var appContext: Context? = null
    private var currentAttempt: Attempt? = null
    private var reconnectJob: Job? = null
    private var reconnectAttempt = 0
    // Incremented by start() and end() so a stale ticket request can tell it was superseded.
    private var generation = 0

    val inCall: Boolean get() = starting || session != null

    fun start(api: MobileApi, context: Context) {
        val app = context.applicationContext
        if (inCall) return
        if (ContextCompat.checkSelfPermission(app, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            markPermissionDenied()
            return
        }
        this.api = api
        this.appContext = app
        generation++
        reconnectAttempt = 0
        notice = null
        caption = null
        muted = false
        gateVisible = false
        VoiceCallService.start(app)
        connect()
    }

    fun markPermissionDenied() {
        state = VoiceUiState.Denied
        notice = "Microphone permission is needed. Allow it to start a call."
        gateVisible = true
    }

    fun toggleMute() {
        muted = !muted
        session?.setMuted(muted)
    }

    /** User hang-up (button or notification). */
    fun end() {
        generation++
        val live = session
        currentAttempt = null
        finishCall("Call ended.")
        live?.stop()
    }

    private fun connect() {
        val api = api ?: return
        val app = appContext ?: return
        val myGeneration = generation
        starting = true
        state = if (reconnectAttempt > 0) VoiceUiState.Reconnecting else VoiceUiState.Connecting
        WakeWordService.pauseForVoiceCall(app)
        scope.launch {
            try {
                val ticket = api.createVoiceTicket()
                if (myGeneration != generation) return@launch
                val attempt = Attempt()
                currentAttempt = attempt
                val voice = NativeVoiceSession(app, api.voiceWebSocketUrl(ticket)) { event ->
                    main.post { onEvent(attempt, event) }
                }
                voice.setMuted(muted)
                session = voice
                starting = false
                voice.connect()
            } catch (error: Exception) {
                if (myGeneration != generation) return@launch
                starting = false
                if (reconnectAttempt in 1 until MAX_RECONNECTS) {
                    scheduleReconnect()
                } else {
                    finishCall(error.message ?: "Could not create a secure voice session.")
                }
            }
        }
    }

    private fun onEvent(attempt: Attempt, event: NativeVoiceSession.Event) {
        if (attempt !== currentAttempt) return
        when (event) {
            NativeVoiceSession.Event.Connected -> Unit
            is NativeVoiceSession.Event.State -> {
                if (event.state == VoiceUiState.Listening) {
                    attempt.reachedListening = true
                    reconnectAttempt = 0
                }
                state = event.state
                if (event.state != VoiceUiState.Listening && event.state != VoiceUiState.Speaking) audioLevel = 0f
            }
            is NativeVoiceSession.Event.Caption -> caption = event.text
            is NativeVoiceSession.Event.AudioLevel -> audioLevel = event.value
            is NativeVoiceSession.Event.Error -> attempt.error = event
            NativeVoiceSession.Event.Ended -> onSessionEnded(attempt)
        }
    }

    private fun onSessionEnded(attempt: Attempt) {
        currentAttempt = null
        session = null
        starting = false
        audioLevel = 0f
        val error = attempt.error
        // A dropped connection in the middle of a call: try again instead of ending it.
        if (error != null && error.retryable && attempt.reachedListening && reconnectAttempt < MAX_RECONNECTS) {
            scheduleReconnect()
            return
        }
        val message = error?.message ?: if (!attempt.reachedListening) "Call ended before voice was ready." else "Call ended."
        finishCall(message)
    }

    private fun scheduleReconnect() {
        reconnectAttempt++
        state = VoiceUiState.Reconnecting
        caption = null
        val myGeneration = generation
        val waitMs = 800L * (1L shl (reconnectAttempt - 1))
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(waitMs)
            if (myGeneration == generation) connect()
        }
    }

    private fun finishCall(message: String?) {
        reconnectJob?.cancel()
        reconnectJob = null
        currentAttempt = null
        starting = false
        session = null
        audioLevel = 0f
        caption = null
        state = VoiceUiState.Ended
        notice = message
        gateVisible = true
        appContext?.let {
            WakeWordService.resumeAfterVoiceCall(it)
            VoiceCallService.stop(it)
        }
    }
}
