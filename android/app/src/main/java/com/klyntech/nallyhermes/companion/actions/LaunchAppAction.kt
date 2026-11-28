package com.klyntech.nallyhermes.companion.actions

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import com.klyntech.nallyhermes.companion.CompanionCapability
import com.klyntech.nallyhermes.companion.ConfirmationTier
import com.klyntech.nallyhermes.companion.protocol.CompanionRequest
import com.klyntech.nallyhermes.companion.protocol.CompanionResult
import org.json.JSONObject

/**
 * Launches an installed app by package name or common display name.
 *
 * Params (one of):
 *   packageName – exact package (e.g. "com.whatsapp")
 *   name        – friendly name (e.g. "WhatsApp", "Camera", "Settings")
 */
class LaunchAppAction : CompanionCapability {
    override val id = "launch_app"
    override val displayName = "Open app"
    override val description = "Launch an installed application"
    override val confirmationTier = ConfirmationTier.SOFT
    override val requiredPermission: String? = null

    // Common aliases → package names. Extend as needed.
    private val aliases = mapOf(
        "whatsapp" to "com.whatsapp",
        "telegram" to "org.telegram.messenger",
        "chrome" to "com.android.chrome",
        "camera" to "com.android.camera",
        "settings" to "com.android.settings",
        "photos" to "com.google.android.apps.photos",
        "gmail" to "com.google.android.gm",
        "maps" to "com.google.android.apps.maps",
        "youtube" to "com.google.android.youtube",
        "spotify" to "com.spotify.music",
        "instagram" to "com.instagram.android",
        "twitter" to "com.twitter.android",
        "x" to "com.twitter.android",
        "phone" to "com.android.dialer",
        "messages" to "com.google.android.apps.messaging",
        "clock" to "com.android.deskclock",
        "calculator" to "com.android.calculator2"
    )

    override suspend fun execute(context: Context, request: CompanionRequest): CompanionResult {
        val packageName = resolvePackageName(context, request)
            ?: return CompanionResult.failure(
                request.requestId,
                "Provide 'packageName' or a recognised 'name' (e.g. WhatsApp, Camera, Settings)."
            )

        return try {
            val pm = context.packageManager
            val launchIntent = pm.getLaunchIntentForPackage(packageName)
                ?: return CompanionResult.failure(
                    request.requestId,
                    "App '$packageName' is not installed or has no launch activity."
                )

            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(launchIntent)

            val label = try {
                val info = pm.getApplicationInfo(packageName, 0)
                pm.getApplicationLabel(info).toString()
            } catch (_: Exception) {
                packageName
            }

            val data = JSONObject()
                .put("packageName", packageName)
                .put("label", label)

            CompanionResult.success(request.requestId, "Opened $label.", data)
        } catch (e: Exception) {
            CompanionResult.failure(request.requestId, e.message ?: "Failed to launch app.")
        }
    }

    private fun resolvePackageName(context: Context, request: CompanionRequest): String? {
        val explicit = request.params.optString("packageName").takeIf { it.isNotBlank() }
        if (explicit != null) return explicit

        val name = request.params.optString("name").trim().lowercase()
        if (name.isBlank()) return null

        // Direct alias hit
        aliases[name]?.let { return it }

        // Fuzzy: look through installed launchable apps
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val apps = pm.queryIntentActivities(intent, PackageManager.MATCH_ALL)
        for (resolve in apps) {
            val label = resolve.loadLabel(pm).toString().lowercase()
            if (label == name || label.contains(name) || name.contains(label)) {
                return resolve.activityInfo.packageName
            }
        }
        return null
    }
}
