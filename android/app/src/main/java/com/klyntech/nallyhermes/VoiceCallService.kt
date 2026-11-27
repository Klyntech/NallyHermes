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
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.klyntech.nallyhermes.ui.VoiceCallManager

/**
 * Keeps the process (and the call's microphone) alive while a voice call is running, so the call
 * survives switching tabs, locking the screen or leaving the app. The call itself lives in
 * [VoiceCallManager]; this service only owns the "In a call" notification and its Hang up action.
 */
class VoiceCallService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_HANG_UP) {
            VoiceCallManager.end()
            stopSelfSafe()
            return START_NOT_STICKY
        }
        ensureChannel()
        if (!startAsForeground()) stopSelfSafe()
        return START_NOT_STICKY
    }

    private fun startAsForeground(): Boolean = try {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                action = WakeWordService.ACTION_OPEN_VOICE
                putExtra(WakeWordService.EXTRA_OPEN_VOICE, true)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val hangUp = PendingIntent.getService(
            this, 2,
            Intent(this, VoiceCallService::class.java).setAction(ACTION_HANG_UP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("In a call with Nally")
            .setContentText("Tap to return. The microphone is in use.")
            .setSmallIcon(R.drawable.ic_wake_notif)
            .setContentIntent(open)
            .addAction(0, "Hang up", hangUp)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIF_ID, notification)
        }
        true
    } catch (error: Throwable) {
        Log.w(TAG, "Could not start the call service; the call continues while the app is open", error)
        false
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Voice call", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shown while you are in a voice call with Nally"
                setShowBadge(false)
            }
        )
    }

    private fun stopSelfSafe() {
        try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (_: Exception) { }
        try { stopSelf() } catch (_: Exception) { }
    }

    companion object {
        private const val TAG = "NallyVoiceCall"
        private const val CHANNEL_ID = "nally_voice_call"
        private const val NOTIF_ID = 44
        const val ACTION_HANG_UP = "com.klyntech.nallyhermes.CALL_HANG_UP"

        fun start(context: Context) {
            try {
                val intent = Intent(context, VoiceCallService::class.java)
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
            } catch (error: Throwable) {
                Log.w(TAG, "start failed", error)
            }
        }

        fun stop(context: Context) {
            try { context.stopService(Intent(context, VoiceCallService::class.java)) } catch (_: Exception) { }
        }
    }
}
