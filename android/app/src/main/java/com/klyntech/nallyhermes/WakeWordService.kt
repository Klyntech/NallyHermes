package com.klyntech.nallyhermes

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.app.NotificationCompat
import java.util.Locale

/**
 * Lightweight always-on-ish wake listener using the platform SpeechRecognizer.
 * Completely separate from [com.klyntech.nallyhermes.ui.NativeVoiceSession] /
 * WebSocket duplex voice — when a live call is active ([WakeWordPrefs.voiceCallActive]),
 * this service does not hold or request the microphone.
 */
class WakeWordService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var listening = false
    private var destroyed = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
        startForegroundCompat()
        main.post { armRecognizer() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
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

    private fun armRecognizer() {
        if (destroyed || !WakeWordPrefs.isEnabled(this)) {
            stopSelf()
            return
        }
        if (WakeWordPrefs.voiceCallActive) return
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this).also {
                it.setRecognitionListener(listener)
            }
        }
        if (!listening) startListeningCycle()
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
        } catch (_: Exception) {
            listening = false
            main.postDelayed({ armRecognizer() }, 2_500)
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
        // Debounce: pause briefly then open voice tab
        tearRecognizer()
        val launch = Intent(this, MainActivity::class.java).apply {
            action = ACTION_OPEN_VOICE
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra(EXTRA_OPEN_VOICE, true)
        }
        startActivity(launch)
        main.postDelayed({ if (!destroyed && !WakeWordPrefs.voiceCallActive) armRecognizer() }, 4_000)
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() { listening = false }
        override fun onError(error: Int) {
            listening = false
            // 7=NO_MATCH, 6=SPEECH_TIMEOUT — restart quietly
            if (!destroyed && !WakeWordPrefs.voiceCallActive) {
                main.postDelayed({ startListeningCycle() }, 900)
            }
        }
        override fun onResults(results: Bundle?) {
            listening = false
            val texts = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
            texts.firstOrNull()?.let { onHeard(it) }
            if (!destroyed && !WakeWordPrefs.voiceCallActive) {
                main.postDelayed({ startListeningCycle() }, 600)
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
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Wake word", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Listens for Hey Nally when enabled"
                setShowBadge(false)
            }
        )
    }

    private fun startForegroundCompat() {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Nally wake word")
            .setContentText("Listening for \"Hey Nally\"")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(open)
            .setOngoing(true)
            .setSilent(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    companion object {
        const val CHANNEL_ID = "nally_wake_word"
        const val NOTIF_ID = 42
        const val ACTION_STOP = "com.klyntech.nallyhermes.WAKE_STOP"
        const val ACTION_PAUSE_FOR_CALL = "com.klyntech.nallyhermes.WAKE_PAUSE"
        const val ACTION_RESUME_AFTER_CALL = "com.klyntech.nallyhermes.WAKE_RESUME"
        const val ACTION_OPEN_VOICE = "com.klyntech.nallyhermes.OPEN_VOICE"
        const val EXTRA_OPEN_VOICE = "open_voice"

        private val WAKE_PHRASES = listOf(
            "hey nally", "hi nally", "hello nally", "ok nally", "okay nally", "nally"
        )

        fun start(context: Context) {
            if (!WakeWordPrefs.isEnabled(context)) return
            val i = Intent(context, WakeWordService::class.java)
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i) else context.startService(i)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, WakeWordService::class.java).setAction(ACTION_STOP))
            context.stopService(Intent(context, WakeWordService::class.java))
        }

        fun pauseForVoiceCall(context: Context) {
            WakeWordPrefs.voiceCallActive = true
            context.startService(Intent(context, WakeWordService::class.java).setAction(ACTION_PAUSE_FOR_CALL))
        }

        fun resumeAfterVoiceCall(context: Context) {
            WakeWordPrefs.voiceCallActive = false
            if (WakeWordPrefs.isEnabled(context)) {
                start(context)
                context.startService(Intent(context, WakeWordService::class.java).setAction(ACTION_RESUME_AFTER_CALL))
            }
        }
    }
}
