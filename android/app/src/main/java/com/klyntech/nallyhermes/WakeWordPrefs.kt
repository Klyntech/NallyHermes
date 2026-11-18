package com.klyntech.nallyhermes

import android.content.Context

object WakeWordPrefs {
    private const val PREFS = "nally_wake_word"
    private const val KEY_ENABLED = "enabled"

    /** When true, the full-duplex voice call owns the mic — wake word must stay silent. */
    @Volatile
    var voiceCallActive: Boolean = false

    /** Last human-readable failure (shown in Settings). */
    @Volatile
    var lastError: String? = null

    fun isEnabled(context: Context): Boolean =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_ENABLED, enabled).apply()
        if (enabled) lastError = null
    }
}
