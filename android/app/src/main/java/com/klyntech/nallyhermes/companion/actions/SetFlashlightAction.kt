package com.klyntech.nallyhermes.companion.actions

import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import com.klyntech.nallyhermes.companion.CompanionCapability
import com.klyntech.nallyhermes.companion.ConfirmationTier
import com.klyntech.nallyhermes.companion.protocol.CompanionRequest
import com.klyntech.nallyhermes.companion.protocol.CompanionResult
import org.json.JSONObject

/**
 * Turns the device flashlight (torch) on or off.
 *
 * Params:
 *   enabled – boolean (required)
 *
 * Uses CameraManager.setTorchMode. On most devices this does not require
 * the CAMERA permission when only the torch is used, but we still declare
 * the feature check.
 */
class SetFlashlightAction : CompanionCapability {
    override val id = "set_flashlight"
    override val displayName = "Flashlight"
    override val description = "Turn the flashlight on or off"
    override val confirmationTier = ConfirmationTier.SOFT
    override val requiredPermission: String? = null

    override suspend fun execute(context: Context, request: CompanionRequest): CompanionResult {
        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_FLASH)) {
            return CompanionResult.failure(request.requestId, "This device has no flashlight.")
        }

        if (!request.params.has("enabled")) {
            return CompanionResult.failure(request.requestId, "Missing required parameter 'enabled' (true/false).")
        }
        val enabled = request.params.optBoolean("enabled")

        return try {
            val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = findTorchCameraId(cameraManager)
                ?: return CompanionResult.failure(request.requestId, "No camera with torch found.")

            cameraManager.setTorchMode(cameraId, enabled)

            val data = JSONObject()
                .put("enabled", enabled)
                .put("cameraId", cameraId)

            CompanionResult.success(
                request.requestId,
                if (enabled) "Flashlight turned on." else "Flashlight turned off.",
                data
            )
        } catch (e: Exception) {
            CompanionResult.failure(
                request.requestId,
                e.message ?: "Failed to control flashlight. It may be in use by another app."
            )
        }
    }

    private fun findTorchCameraId(cameraManager: CameraManager): String? {
        for (id in cameraManager.cameraIdList) {
            val chars = cameraManager.getCameraCharacteristics(id)
            val hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            val facing = chars.get(CameraCharacteristics.LENS_FACING)
            // Prefer back camera
            if (hasFlash && facing == CameraCharacteristics.LENS_FACING_BACK) return id
        }
        // Fallback: any camera with flash
        for (id in cameraManager.cameraIdList) {
            val chars = cameraManager.getCameraCharacteristics(id)
            if (chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true) return id
        }
        return null
    }
}
