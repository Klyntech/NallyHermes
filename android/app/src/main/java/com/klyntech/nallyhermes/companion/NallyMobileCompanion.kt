package com.klyntech.nallyhermes.companion

import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.klyntech.nallyhermes.companion.protocol.CompanionRequest
import com.klyntech.nallyhermes.companion.protocol.CompanionResult
import com.klyntech.nallyhermes.companion.protocol.CompanionStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Public entry point for the Nally Mobile Companion.
 *
 * Call [execute] from the UI layer, voice session, or a future bound service
 * when the agent requests a device action.
 *
 * Threading: safe to call from any thread; work is moved to Dispatchers.Default.
 */
object NallyMobileCompanion {

    /**
     * Execute a structured Companion request and return a structured result.
     */
    suspend fun execute(context: Context, request: CompanionRequest): CompanionResult =
        withContext(Dispatchers.Default) {
            val capability = CompanionCapabilityRegistry.get(request.action)
                ?: return@withContext CompanionResult.unsupported(request.requestId, request.action)

            // Permission gate
            val permission = capability.requiredPermission
            if (permission != null) {
                val granted = ContextCompat.checkSelfPermission(context, permission) ==
                    PackageManager.PERMISSION_GRANTED
                if (!granted) {
                    return@withContext CompanionResult.needsPermission(
                        request.requestId,
                        permission,
                        "Permission '$permission' is required for ${capability.displayName}."
                    )
                }
            }

            // HARD confirmation is the caller's responsibility for now.
            // Future: integrate with an in-app confirmation dialog and resume.
            try {
                capability.execute(context.applicationContext, request)
            } catch (e: Exception) {
                CompanionResult.failure(
                    request.requestId,
                    e.message ?: "Unexpected error while running ${capability.displayName}."
                )
            }
        }

    /**
     * Convenience: parse a raw JSON object and execute.
     */
    suspend fun executeJson(context: Context, raw: JSONObject): CompanionResult {
        return try {
            val request = CompanionRequest.fromJson(raw)
            execute(context, request)
        } catch (e: Exception) {
            CompanionResult(
                requestId = raw.optString("requestId", "unknown"),
                status = CompanionStatus.FAILURE,
                message = e.message ?: "Invalid Companion request."
            )
        }
    }

    /** List of supported action ids (for agent tool discovery / debug). */
    fun supportedActions(): Set<String> = CompanionCapabilityRegistry.ids()

    fun catalogue(): List<Map<String, String>> = CompanionCapabilityRegistry.catalogue()
}
