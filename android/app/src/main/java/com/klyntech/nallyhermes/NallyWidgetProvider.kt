package com.klyntech.nallyhermes

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/** Shared click targets and status for all Nally home-screen widgets. */
internal object NallyWidgetClicks {
    fun openApp(context: Context, requestCode: Int): PendingIntent =
        PendingIntent.getActivity(
            context, requestCode,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    fun openVoice(context: Context, requestCode: Int, autoStart: Boolean = true): PendingIntent =
        PendingIntent.getActivity(
            context, requestCode,
            Intent(context, MainActivity::class.java).apply {
                action = WakeWordService.ACTION_OPEN_VOICE
                putExtra(WakeWordService.EXTRA_OPEN_VOICE, true)
                putExtra(WakeWordService.EXTRA_AUTO_START, autoStart)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    fun statusLabel(context: Context): String =
        if (WakeWordPrefs.voiceCallActive) "In call" else "Ready"

    fun wakeLabel(context: Context): String =
        if (WakeWordPrefs.isEnabled(context)) "Wake on" else "Wake off"
}

/** A — Now Playing voice card (3×3). */
class NallyWidgetVoiceProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_nally_voice)
            views.setTextViewText(R.id.widget_status, NallyWidgetClicks.statusLabel(context))
            views.setOnClickPendingIntent(R.id.widget_root, NallyWidgetClicks.openApp(context, 10 + id))
            views.setOnClickPendingIntent(R.id.widget_voice_btn, NallyWidgetClicks.openVoice(context, 20 + id))
            views.setOnClickPendingIntent(R.id.widget_chat_btn, NallyWidgetClicks.openApp(context, 30 + id))
            views.setOnClickPendingIntent(R.id.widget_settings_btn, NallyWidgetClicks.openApp(context, 40 + id))
            appWidgetManager.updateAppWidget(id, views)
        }
    }
}

/** B — Glass control pad (2×2). */
class NallyWidgetPadProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_nally_pad)
            views.setOnClickPendingIntent(R.id.widget_root, NallyWidgetClicks.openApp(context, 50 + id))
            views.setOnClickPendingIntent(R.id.widget_voice_btn, NallyWidgetClicks.openVoice(context, 60 + id))
            views.setOnClickPendingIntent(R.id.widget_chat_btn, NallyWidgetClicks.openApp(context, 70 + id))
            appWidgetManager.updateAppWidget(id, views)
        }
    }
}

/** C — Status instrument strip (3×1). */
class NallyWidgetStatusProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_nally_status)
            views.setTextViewText(R.id.widget_status, NallyWidgetClicks.statusLabel(context))
            views.setTextViewText(R.id.widget_substatus, NallyWidgetClicks.wakeLabel(context))
            views.setOnClickPendingIntent(R.id.widget_root, NallyWidgetClicks.openApp(context, 80 + id))
            views.setOnClickPendingIntent(R.id.widget_voice_btn, NallyWidgetClicks.openVoice(context, 90 + id))
            appWidgetManager.updateAppWidget(id, views)
        }
    }
}

/** Legacy alias so existing home-screen instances keep working. */
class NallyWidgetProvider : NallyWidgetVoiceProvider()
