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
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.openwakeword.OpenWakeWord

/**
 * On-device wake word via **openWakeWord** (msnilsen Android port):
 * continuous [android.media.AudioRecord] at 16 kHz + ONNX pipeline
 * (mel → embedding → classifier). No SpeechRecognizer loop → no green-dot flicker.
 *
 * Independent from duplex [com.klyntech.nallyhermes.ui.NativeVoiceSession].
 * Paused while a live voice call owns the mic.
 *
 * Uses the custom "Hey Nally" ONNX asset when installed; until then it uses the
 * bundled "Hey Jarvis" model and reports that phrase honestly in the UI/notification.
 *
 * When Nally is the default assistant, detection opens the call immediately via the
 * voice-interaction session (no extra tap). Otherwise a heads-up notification is shown.
 */
class WakeWordService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private var detector: OpenWakeWord? = null
    private var destroyed = false
    @Volatile
    private var running = false
    private var startAttempts = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        try {
            ensureChannel()
            if (!startForegroundCompat()) {
                // Transient foreground failures are retried; permanent ones disable the setting.
                scheduleRetryOrFail("Could not start wake-word notification service.")
                return
            }
            main.post { startDetectorIfNeeded() }
        } catch (t: Throwable) {
            Log.e(TAG, "onCreate", t)
            scheduleRetryOrFail(t.message ?: "Wake word service failed to start.")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
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
            val built = builder.setThreshold(0.5f).setDebounceMs(2_500L).build()
            detector = built
            built.start { score ->
                Log.i(TAG, "Wake detected score=$score")
                onWakeDetected()
            }
            running = true
            startAttempts = 0
            WakeWordPrefs.lastError = null
            Log.i(TAG, "openWakeWord started (${if (customModelPresent) "Hey Nally custom" else "Hey Jarvis bundled"})")
        } catch (t: Throwable) {
            Log.e(TAG, "startDetector", t)
            scheduleRetryOrFail(t.message ?: "openWakeWord failed to start.")
        }
    }

    private fun stopDetector() {
        running = false
        try { detector?.stop() } catch (_: Exception) {}
        try { detector?.release() } catch (_: Exception) {}
        detector = null
    }

    private fun onWakeDetected() {
        if (!running || WakeWordPrefs.voiceCallActive) return
        stopDetector()
        haptic()
        // Prefer the system assistant path when Nally is the default digital assistant —
        // that opens the Voice tab and starts listening with no extra tap.
        if (NallyAssistant.showFromWake(this)) {
            main.postDelayed({
                if (!destroyed && !WakeWordPrefs.voiceCallActive && WakeWordPrefs.isEnabled(this)) {
                    startDetectorIfNeeded()
                }
            }, 15_000)
            return
        }
        showWakeDetectedNotification()
        main.postDelayed({
            if (!destroyed && !WakeWordPrefs.voiceCallActive && WakeWordPrefs.isEnabled(this)) {
                startDetectorIfNeeded()
            }
        }, 15_000)
    }

    private fun haptic() {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                val vm = getSystemService(VibratorManager::class.java) ?: return
                vm.defaultVibrator.vibrate(VibrationEffect.createOneShot(40, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                val v = getSystemService(Vibrator::class.java) ?: return
                if (Build.VERSION.SDK_INT >= 26) {
                    v.vibrate(VibrationEffect.createOneShot(40, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    v.vibrate(40)
                }
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
            val notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("${wakePhrase(this)} detected")
                .setContentText("Tap to talk")
                .setSmallIcon(R.drawable.ic_wake_notif)
                .setContentIntent(open)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .build()
            getSystemService(NotificationManager::class.java)?.notify(WAKE_DETECTED_NOTIF_ID, notification)
        } catch (t: Throwable) {
            Log.e(TAG, "wake notification", t)
        }
    }

    private fun scheduleRetryOrFail(reason: String) {
        startAttempts += 1
        if (startAttempts <= 3) {
            Log.w(TAG, "Transient start failure ($startAttempts/3): $reason")
            WakeWordPrefs.lastError = reason
            main.postDelayed({
                if (!destroyed && WakeWordPrefs.isEnabled(this)) startDetectorIfNeeded()
            }, 2_500L * startAttempts)
        } else {
            failAndStop(reason)
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
        try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (_: Exception) {}
        try { stopSelf() } catch (_: Exception) {}
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Wake word", NotificationManager.IMPORTANCE_LOW).apply {
                description = "On-device openWakeWord listener"
                setShowBadge(false)
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
            val stop = PendingIntent.getService(
                this, 1,
                Intent(this, WakeWordService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Nally wake word")
                .setContentText("Listening for \"${wakePhrase(this)}\" (on-device)")
                .setSmallIcon(R.drawable.ic_wake_notif)
                .setContentIntent(open)
                .addAction(0, "Turn off", stop)
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
        const val NOTIF_ID = 42
        private const val WAKE_DETECTED_NOTIF_ID = 43
        const val ACTION_STOP = "com.klyntech.nallyhermes.WAKE_STOP"
        const val ACTION_PAUSE_FOR_CALL = "com.klyntech.nallyhermes.WAKE_PAUSE"
        const val ACTION_RESUME_AFTER_CALL = "com.klyntech.nallyhermes.WAKE_RESUME"
        const val ACTION_OPEN_VOICE = "com.klyntech.nallyhermes.OPEN_VOICE"
        const val EXTRA_OPEN_VOICE = "open_voice"
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
                // Don't flip the setting off for a single transient start failure.
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
