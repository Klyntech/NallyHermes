package com.klyntech.nallyhermes

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.speech.RecognitionService
import android.speech.SpeechRecognizer
import android.util.Log

/**
 * Registers Nally as a selectable "Digital assistant app". When the user picks it, the power-button
 * long-press / corner-swipe gesture (and the wake word, via [showFromWake]) opens Nally straight into a
 * call. Android reserves indicator-free always-on hotword detection for the system assistant, so this
 * is the closest third-party equivalent: no microphone is open while idle.
 */
object NallyAssistant {
    private const val TAG = "NallyAssistant"

    fun isDefaultAssistant(context: Context): Boolean = try {
        VoiceInteractionService.isActiveService(
            context,
            ComponentName(context, NallyVoiceInteractionService::class.java)
        )
    } catch (_: Exception) {
        false
    }

    /** Asks the system to show the assistant session. Returns false when Nally is not the assistant. */
    fun showFromWake(context: Context): Boolean {
        val service = NallyVoiceInteractionService.instance ?: return false
        if (!isDefaultAssistant(context)) return false
        return try {
            service.showSession(Bundle(), VoiceInteractionSession.SHOW_WITH_ASSIST)
            true
        } catch (error: Exception) {
            Log.w(TAG, "showSession failed", error)
            false
        }
    }

    fun openAssistantSettings(context: Context) {
        try {
            context.startActivity(Intent(Settings.ACTION_VOICE_INPUT_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (error: Exception) {
            Log.w(TAG, "Could not open assistant settings", error)
        }
    }
}

class NallyVoiceInteractionService : VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
        instance = this
    }

    override fun onShutdown() {
        if (instance === this) instance = null
        super.onShutdown()
    }

    companion object {
        @Volatile
        var instance: NallyVoiceInteractionService? = null
    }
}

class NallyVoiceInteractionSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession = NallyVoiceInteractionSession(this)
}

/** Opens the app on the Voice tab and starts listening immediately, then hides the empty session. */
class NallyVoiceInteractionSession(context: Context) : VoiceInteractionSession(context) {
    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        val intent = Intent(context, MainActivity::class.java).apply {
            action = WakeWordService.ACTION_OPEN_VOICE
            putExtra(WakeWordService.EXTRA_OPEN_VOICE, true)
            putExtra(WakeWordService.EXTRA_AUTO_START, true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        try {
            startAssistantActivity(intent)
        } catch (error: Exception) {
            Log.w("NallyAssistant", "startAssistantActivity failed", error)
        }
        hide()
    }
}

/** The assistant metadata requires a recognition service. Nally does not offer dictation, so this only errors. */
class NallyRecognitionService : RecognitionService() {
    override fun onStartListening(recognizerIntent: Intent?, listener: Callback?) {
        try { listener?.error(SpeechRecognizer.ERROR_CLIENT) } catch (_: Exception) { }
    }

    override fun onCancel(listener: Callback?) = Unit

    override fun onStopListening(listener: Callback?) = Unit
}
