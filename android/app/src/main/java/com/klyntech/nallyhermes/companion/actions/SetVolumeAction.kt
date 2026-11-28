package com.klyntech.nallyhermes.companion.actions

import android.content.Context
import android.media.AudioManager
import com.klyntech.nallyhermes.companion.CompanionCapability
import com.klyntech.nallyhermes.companion.ConfirmationTier
import com.klyntech.nallyhermes.companion.protocol.CompanionRequest
import com.klyntech.nallyhermes.companion.protocol.CompanionResult
import org.json.JSONObject

/**
 * Sets media / ring / alarm / notification volume.
 *
 * Params:
 *   stream  – "music" | "ring" | "alarm" | "notification" | "voice_call" (default: music)
 *   level   – 0.0 .. 1.0 (fraction of max)
 *   or
 *   percent – 0 .. 100
 */
class SetVolumeAction : CompanionCapability {
    override val id = "set_volume"
    override val displayName = "Set volume"
    override val description = "Adjust media, ring, or alarm volume"
    override val confirmationTier = ConfirmationTier.SOFT
    override val requiredPermission: String? = null

    override suspend fun execute(context: Context, request: CompanionRequest): CompanionResult {
        return try {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val streamName = request.params.optString("stream", "music").lowercase()
            val stream = when (streamName) {
                "music", "media" -> AudioManager.STREAM_MUSIC
                "ring", "ringtone" -> AudioManager.STREAM_RING
                "alarm" -> AudioManager.STREAM_ALARM
                "notification" -> AudioManager.STREAM_NOTIFICATION
                "voice_call", "call" -> AudioManager.STREAM_VOICE_CALL
                else -> return CompanionResult.failure(
                    request.requestId,
                    "Unknown stream '$streamName'. Use music, ring, alarm, notification, or voice_call."
                )
            }

            val max = am.getStreamMaxVolume(stream).coerceAtLeast(1)
            val target = resolveTargetVolume(request, max)
                ?: return CompanionResult.failure(
                    request.requestId,
                    "Provide either 'level' (0.0-1.0) or 'percent' (0-100)."
                )

            val clamped = target.coerceIn(0, max)
            am.setStreamVolume(stream, clamped, 0)

            val percent = (clamped * 100) / max
            val data = JSONObject()
                .put("stream", streamName)
                .put("volume", clamped)
                .put("max", max)
                .put("percent", percent)

            CompanionResult.success(
                request.requestId,
                "Set $streamName volume to $percent%.",
                data
            )
        } catch (e: Exception) {
            CompanionResult.failure(request.requestId, e.message ?: "Failed to set volume.")
        }
    }

    private fun resolveTargetVolume(request: CompanionRequest, max: Int): Int? {
        if (request.params.has("level")) {
            val level = request.params.optDouble("level", -1.0)
            if (level in 0.0..1.0) return (level * max).toInt()
        }
        if (request.params.has("percent")) {
            val percent = request.params.optInt("percent", -1)
            if (percent in 0..100) return (percent * max) / 100
        }
        return null
    }
}
