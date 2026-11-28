package com.klyntech.nallyhermes.companion.actions

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import com.klyntech.nallyhermes.companion.CompanionCapability
import com.klyntech.nallyhermes.companion.ConfirmationTier
import com.klyntech.nallyhermes.companion.protocol.CompanionRequest
import com.klyntech.nallyhermes.companion.protocol.CompanionResult
import org.json.JSONObject

/**
 * Returns current battery level, charging state, and temperature when available.
 * No permission required on modern Android.
 */
class GetBatteryAction : CompanionCapability {
    override val id = "get_battery"
    override val displayName = "Battery status"
    override val description = "Read battery level and charging state"
    override val confirmationTier = ConfirmationTier.SILENT
    override val requiredPermission: String? = null

    override suspend fun execute(context: Context, request: CompanionRequest): CompanionResult {
        return try {
            val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
                ?: return CompanionResult.failure(request.requestId, "Could not read battery status.")

            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100).coerceAtLeast(1)
            val percent = if (level >= 0) (level * 100) / scale else -1

            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL

            val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
            val chargingSource = when (plugged) {
                BatteryManager.BATTERY_PLUGGED_USB -> "usb"
                BatteryManager.BATTERY_PLUGGED_AC -> "ac"
                BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
                else -> if (isCharging) "unknown" else "none"
            }

            val temp = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
            val temperatureC = if (temp != Int.MIN_VALUE) temp / 10.0 else null

            val data = JSONObject()
                .put("percent", percent)
                .put("isCharging", isCharging)
                .put("chargingSource", chargingSource)

            temperatureC?.let { data.put("temperatureC", it) }

            val message = buildString {
                append("Battery is at $percent%")
                if (isCharging) append(", charging via $chargingSource")
                else append(", not charging")
            }

            CompanionResult.success(request.requestId, message, data)
        } catch (e: Exception) {
            CompanionResult.failure(request.requestId, e.message ?: "Failed to read battery.")
        }
    }
}
