package com.klyntech.nallyhermes

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.util.Locale

/**
 * Wake-word style listener using the **platform SpeechRecognizer**
 * (device / Google speech service — NOT Picovoice Porcupine, NOT the duplex
 * WebSocket voice stack).
 *
 * Important limitations of this engine:
 * - It is continuous dictation-style STT, not a true low-power keyword spotter
 * - Needs network on many devices
 * - Must not run while [NativeVoiceSession] owns the microphone
 *
 * All startup paths are fail-soft: errors disable the preference instead of
 * crashing the UI process.
 */
class WakeWordService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var listening = false
    private var destroyed = false
    private var restartAttempts = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        try {
            ensureChannel()
            if (!startForegroundCompat()) {
                Log.e(TAG, "startForeground failed — disabling wake word")
                failAndStop("Could not start wake-word notification service.")
                return
            }
            main.post { armRecognizer() }
        } catch (t: Throwable) {
            Log.e(TAG, "onCreate failed", t)
            failAndStop(t.message ?: "Wake word service failed to start.")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelfSafe()
                return START_NOT_STICKY
            }
            ACTION_PAUSE_FOR_CALL -> {
                WakeWordPrefs.voiceCallActive = true
                tearRecognizer()
            }
            ACTION_RESUME_AFTER_CALL -> {
                WakeWordPrefs.voiceCallActive = false
                main.post { armRecognizer() }
            }
            else -> main.post { armRecognizer() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        destroyed = true
        tearRecognizer()
        super.onDestroy()
    }

    private fun failAndStop(reason: String) {
        try {
            WakeWordPrefs.setEnabled(this, false)
            WakeWordPrefs.lastError = reason
        } catch (_: Exception) {}
        stopSelfSafe()
    }

    private fun stopSelfSafe() {
        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {}
        try {
            stopSelf()
        } catch (_: Exception) {}
    }

    private fun armRecognizer() {
        if (destroyed) return
        if (!WakeWordPrefs.isEnabled(this)) {
            stopSelfSafe()
            return
        }
        if (WakeWordPrefs.voiceCallActive) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            failAndStop("Microphone permission is required for wake word.")
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            failAndStop("Speech recognition is not available on this device.")
            return
        }
        try {
            if (recognizer == null) {
                recognizer = SpeechRecognizer.createSpeechRecognizer(this).also {
                    it.setRecognitionListener(listener)
                }
            }
            if (!listening) startListeningCycle()
        } catch (t: Throwable) {
            Log.e(TAG, "armRecognizer", t)
            failAndStop(t.message ?: "Could not start speech recognizer.")
        }
    }

    private fun startListeningCycle() {
        if (destroyed || WakeWordPrefs.voiceCallActive || recognizer == null) return
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        }
        try {
            listening = true
            recognizer?.startListening(intent)
            restartAttempts = 0
        } catch (t: Throwable) {
            listening = false
            Log.e(TAG, "startListening", t)
            restartAttempts++
            if (restartAttempts > 8) {
                failAndStop("Speech recognizer kept failing. Wake word turned off.")
            } else {
                main.postDelayed({ armRecognizer() }, 2_500)
            }
        }
    }

    private fun tearRecognizer() {
        listening = false
        try { recognizer?.cancel() } catch (_: Exception) {}
        try { recognizer?.destroy() } catch (_: Exception) {}
        recognizer = null
    }

    private fun onHeard(text: String) {
        val normalized = text.lowercase(Locale.getDefault())
        val hit = WAKE_PHRASES.any { phrase -> normalized.contains(phrase) }
        if (!hit) return
        tearRecognizer()
        try {
            val launch = Intent(this, MainActivity::class.java).apply {
                action = ACTION_OPEN_VOICE
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                )
                putExtra(EXTRA_OPEN_VOICE, true)
            }
            startActivity(launch)
        } catch (t: Throwable) {
            Log.e(TAG, "launch activity", t)
        }
        main.postDelayed({
            if (!destroyed && !WakeWordPrefs.voiceCallActive && WakeWordPrefs.isEnabled(this)) {
                armRecognizer()
            }
        }, 4_000)
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() { listening = false }
        override fun onError(error: Int) {
            listening = false
            // Avoid tight crash loops on permanent errors
            val delay = when (error) {
                SpeechRecognizer.ERROR_CLIENT,
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                    failAndStop("Speech recognition permission or client error ($error).")
                    return
                }
                SpeechRecognizer.ERROR_NETWORK,
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> 3_000L
                else -> 1_200L
            }
            if (!destroyed && !WakeWordPrefs.voiceCallActive && WakeWordPrefs.isEnabled(this@WakeWordService)) {
                main.postDelayed({ startListeningCycle() }, delay)
            }
        }
        override fun onResults(results: Bundle?) {
            listening = false
            val texts = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
            texts.firstOrNull()?.let { onHeard(it) }
            if (!destroyed && !WakeWordPrefs.voiceCallActive && WakeWordPrefs.isEnabled(this@WakeWordService)) {
                main.postDelayed({ startListeningCycle() }, 700)
            }
        }
        override fun onPartialResults(partialResults: Bundle?) {
            val texts = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
            texts.firstOrNull()?.let { onHeard(it) }
        }
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Wake word", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Listens for Hey Nally when enabled"
                setShowBadge(false)
            }
        )
    }

    /** @return false if foreground promotion failed */
    private fun startForegroundCompat(): Boolean {
        return try {
            val open = PendingIntent.getActivity(
                this, 0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Nally wake word")
                .setContentText("Listening for \"Hey Nally\"")
                .setSmallIcon(R.drawable.ic_wake_notif)
                .setContentIntent(open)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(NOTIF_ID, notification)
            }
            true
        } catch (t: Throwable) {
            Log.e(TAG, "startForegroundCompat", t)
            false
        }
    }

    companion object {
        private const val TAG = "NallyWakeWord"
        const val CHANNEL_ID = "nally_wake_word"
        const val NOTIF_ID = 42
        const val ACTION_STOP = "com.klyntech.nallyhermes.WAKE_STOP"
        const val ACTION_PAUSE_FOR_CALL = "com.klyntech.nallyhermes.WAKE_PAUSE"
        const val ACTION_RESUME_AFTER_CALL = "com.klyntech.nallyhermes.WAKE_RESUME"
        const val ACTION_OPEN_VOICE = "com.klyntech.nallyhermes.OPEN_VOICE"
        const val EXTRA_OPEN_VOICE = "open_voice"

        private val WAKE_PHRASES = listOf(
            "hey nally", "hi nally", "hello nally", "ok nally", "okay nally"
        )

        fun start(context: Context): Boolean {
            if (!WakeWordPrefs.isEnabled(context)) return false
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED
            ) {
                WakeWordPrefs.setEnabled(context, false)
                WakeWordPrefs.lastError = "Microphone permission required."
                return false
            }
            return try {
                val i = Intent(context, WakeWordService::class.java)
                if (Build.VERSION.SDK_INT >= 26) {
                    context.startForegroundService(i)
                } else {
                    context.startService(i)
                }
                true
            } catch (t: Throwable) {
                Log.e(TAG, "start()", t)
                WakeWordPrefs.setEnabled(context, false)
                WakeWordPrefs.lastError = t.message ?: "Could not start wake word service."
                false
            }
        }

        fun stop(context: Context) {
            try {
                context.startService(Intent(context, WakeWordService::class.java).setAction(ACTION_STOP))
            } catch (_: Exception) {}
            try {
                context.stopService(Intent(context, WakeWordService::class.java))
            } catch (_: Exception) {}
        }

        fun pauseForVoiceCall(context: Context) {
            WakeWordPrefs.voiceCallActive = true
            try {
                context.startService(
                    Intent(context, WakeWordService::class.java).setAction(ACTION_PAUSE_FOR_CALL)
                )
            } catch (_: Exception) {}
        }

        fun resumeAfterVoiceCall(context: Context) {
            WakeWordPrefs.voiceCallActive = false
            if (WakeWordPrefs.isEnabled(context)) {
                start(context)
                try {
                    context.startService(
                        Intent(context, WakeWordService::class.java).setAction(ACTION_RESUME_AFTER_CALL)
                    )
                } catch (_: Exception) {}
            }
        }
    }
}
