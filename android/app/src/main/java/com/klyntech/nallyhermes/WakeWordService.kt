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
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.openwakeword.OpenWakeWord

/**
 * On-device wake word via **openWakeWord** (msnilsen Android port):
 * continuous [android.media.AudioRecord] at 16 kHz + ONNX pipeline
 * (mel → embedding → classifier). No SpeechRecognizer loop → no green-dot flicker.
 *
 * Android shows its microphone indicator whenever an ordinary app records audio, so this mode
 * always shows the indicator while it is listening. Indicator-free invocation is available by making
 * Nally the default digital assistant (see [NallyAssistant]).
 *
 * Independent from duplex [com.klyntech.nallyhermes.ui.NativeVoiceSession].
 * Paused while a live voice call owns the mic.
 *
 * Uses the custom "Hey Nally" ONNX asset when installed; until then it uses the
 * bundled "Hey Jarvis" model and reports that phrase honestly in the UI/notification.
 */
class WakeWordService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private var detector: OpenWakeWord? = null
    private var destroyed = false
    private var startFailures = 0
    @Volatile
    private var running = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        try {
            ensureChannels()
            if (!startForegroundCompat()) {
                failAndStop("Could not start wake-word notification service.")
                return
            }
            main.post { startDetectorIfNeeded() }
        } catch (t: Throwable) {
            Log.e(TAG, "onCreate", t)
            failAndStop(t.message ?: "Wake word service failed to start.")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                // Both the notification's "Turn off" action and Settings land here.
                WakeWordPrefs.setEnabled(this, false)
                stopDetector()
                stopSelfSafe()
                return START_NOT_STICKY
            }
            ACTION_PAUSE_FOR_CALL -> {
                WakeWordPrefs.voiceCallActive = true
                stopDetector()
            }
            ACTION_RESUME_AFTER_CALL -> {
                WakeWordPrefs.voiceCallActive = false
                main.post { startDetectorIfNeeded() }
            }
            else -> main.post { startDetectorIfNeeded() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        destroyed = true
        stopDetector()
        super.onDestroy()
    }

    private fun startDetectorIfNeeded() {
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
        if (running && detector != null) return
        try {
            stopDetector()
            val customModelPresent = applicationContext.assets.list("")?.contains(CUSTOM_MODEL_ASSET) == true
            val builder = OpenWakeWord.Builder(applicationContext)
            if (customModelPresent) builder.setModelAsset(CUSTOM_MODEL_ASSET)
            else builder.setModel(OpenWakeWord.BuiltInModel.HEY_JARVIS)
            val built = builder.setThreshold(WAKE_THRESHOLD).setDebounceMs(2_500L).build()
            detector = built
            built.start { score ->
                Log.i(TAG, "Wake detected score=$score")
                onWakeDetected()
            }
            running = true
            startFailures = 0
            WakeWordPrefs.lastError = null
            Log.i(TAG, "openWakeWord started (${if (customModelPresent) "Hey Nally custom" else "Hey Jarvis bundled"})")
        } catch (t: Throwable) {
            Log.e(TAG, "startDetector", t)
            stopDetector()
            // A transient failure (mic briefly busy, model still loading) must not silently turn the
            // user's setting off. Retry a few times with backoff before giving up.
            startFailures++
            if (startFailures <= RETRY_DELAYS_MS.size) {
                val delayMs = RETRY_DELAYS_MS[startFailures - 1]
                Log.w(TAG, "Retrying wake word start in ${delayMs}ms (attempt $startFailures)")
                main.postDelayed({ startDetectorIfNeeded() }, delayMs)
            } else {
                failAndStop(t.message ?: "openWakeWord failed to start.")
            }
        }
    }

    private fun stopDetector() {
        running = false
        try {
            detector?.stop()
        } catch (_: Exception) {}
        try {
            detector?.release()
        } catch (_: Exception) {}
        detector = null
    }

    private fun onWakeDetected() {
        if (!running || WakeWordPrefs.voiceCallActive) return
        // Release the microphone so the call can own it.
        stopDetector()
        haptic()
        // When Nally is the default assistant the system opens it straight away. Otherwise Android
        // blocks background activity launches, so fall back to a heads-up notification.
        val openedBySystem = NallyAssistant.showFromWake(applicationContext)
        if (!openedBySystem) showWakeDetectedNotification()
        // Resume spotting if the user does not engage. A started call sets voiceCallActive.
        main.postDelayed({
            if (!destroyed && !WakeWordPrefs.voiceCallActive && WakeWordPrefs.isEnabled(this)) {
                startDetectorIfNeeded()
            }
        }, RESUME_AFTER_WAKE_MS)
    }

    @Suppress("DEPRECATION")
    private fun haptic() {
        try {
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
            if (Build.VERSION.SDK_INT >= 26) {
                vibrator.vibrate(VibrationEffect.createOneShot(35L, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                vibrator.vibrate(35L)
            }
        } catch (_: Exception) {}
    }

    private fun showWakeDetectedNotification() {
        try {
            val launch = Intent(this, MainActivity::class.java).apply {
                action = ACTION_OPEN_VOICE
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                )
                putExtra(EXTRA_OPEN_VOICE, true)
                putExtra(EXTRA_AUTO_START, true)
            }
            val open = PendingIntent.getActivity(
                this, WAKE_DETECTED_NOTIF_ID, launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = NotificationCompat.Builder(this, CHANNEL_WAKE_ID)
                .setContentTitle("${wakePhrase(this)} detected")
                .setContentText("Tap to talk to Nally")
                .setSmallIcon(R.drawable.ic_wake_notif)
                .setContentIntent(open)
                // Opens directly where the OS allows it (locked screen); otherwise shows as a heads-up.
                .setFullScreenIntent(open, true)
                .setAutoCancel(true)
                .setTimeoutAfter(15_000L)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build()
            getSystemService(NotificationManager::class.java)?.notify(WAKE_DETECTED_NOTIF_ID, notification)
        } catch (t: Throwable) {
            Log.e(TAG, "wake notification", t)
        }
    }

    private fun failAndStop(reason: String) {
        try {
            WakeWordPrefs.setEnabled(this, false)
            WakeWordPrefs.lastError = reason
        } catch (_: Exception) {}
        stopDetector()
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

    private fun ensureChannels() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Wake word", NotificationManager.IMPORTANCE_LOW).apply {
                description = "On-device openWakeWord listener"
                setShowBadge(false)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_WAKE_ID, "Wake word detected", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Shown when the wake word is heard so you can start talking"
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
            }
        )
    }

    private fun startForegroundCompat(): Boolean {
        return try {
            val open = PendingIntent.getActivity(
                this, 0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val turnOff = PendingIntent.getService(
                this, 1,
                Intent(this, WakeWordService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Nally is listening for \"${wakePhrase(this)}\"")
                .setContentText("On-device. Android shows the mic indicator while this is on.")
                .setSmallIcon(R.drawable.ic_wake_notif)
                .setContentIntent(open)
                .addAction(0, "Turn off", turnOff)
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
            Log.e(TAG, "startForeground", t)
            false
        }
    }

    companion object {
        private const val TAG = "NallyWakeWord"
        const val CHANNEL_ID = "nally_wake_word"
        const val CHANNEL_WAKE_ID = "nally_wake_detected"
        const val NOTIF_ID = 42
        private const val WAKE_DETECTED_NOTIF_ID = 43
        private const val WAKE_THRESHOLD = 0.5f
        private const val RESUME_AFTER_WAKE_MS = 20_000L
        private val RETRY_DELAYS_MS = longArrayOf(2_000L, 5_000L, 15_000L)
        const val ACTION_STOP = "com.klyntech.nallyhermes.WAKE_STOP"
        const val ACTION_PAUSE_FOR_CALL = "com.klyntech.nallyhermes.WAKE_PAUSE"
        const val ACTION_RESUME_AFTER_CALL = "com.klyntech.nallyhermes.WAKE_RESUME"
        const val ACTION_OPEN_VOICE = "com.klyntech.nallyhermes.OPEN_VOICE"
        const val EXTRA_OPEN_VOICE = "open_voice"
        /** When true the Voice tab starts the call immediately instead of waiting for a tap. */
        const val EXTRA_AUTO_START = "auto_start"
        private const val CUSTOM_MODEL_ASSET = "hey_nally.onnx"

        fun wakePhrase(context: Context): String =
            if (context.applicationContext.assets.list("")?.contains(CUSTOM_MODEL_ASSET) == true) "Hey Nally" else "Hey Jarvis"

        fun start(context: Context): Boolean {
            if (!WakeWordPrefs.isEnabled(context)) return false
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED
            ) {
                WakeWordPrefs.setEnabled(context, false)
                WakeWordPrefs.lastError = "Microphone permission required."
                return false
            }
            if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(
                    context, Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                WakeWordPrefs.setEnabled(context, false)
                WakeWordPrefs.lastError = "Notification permission required for the wake-word foreground service."
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
