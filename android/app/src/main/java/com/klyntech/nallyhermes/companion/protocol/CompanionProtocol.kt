package com.klyntech.nallyhermes.companion.protocol

import org.json.JSONObject

/**
 * Structured request the agent (or debug UI) sends to the Companion.
 * Keep the schema stable — server-side tool definitions will depend on it.
 */
data class CompanionRequest(
    val requestId: String,
    val action: String,
    val params: JSONObject = JSONObject()
) {
    companion object {
        fun fromJson(raw: JSONObject): CompanionRequest {
            val id = raw.optString("requestId").ifBlank {
                throw IllegalArgumentException("requestId is required")
            }
            val action = raw.optString("action").ifBlank {
                throw IllegalArgumentException("action is required")
            }
            val params = raw.optJSONObject("params") ?: JSONObject()
            return CompanionRequest(id, action, params)
        }
    }
}

enum class CompanionStatus {
    SUCCESS,
    FAILURE,
    NEEDS_PERMISSION,
    NEEDS_CONFIRMATION,
    UNSUPPORTED
}

/**
 * Structured result returned to the agent / UI.
 */
data class CompanionResult(
    val requestId: String,
    val status: CompanionStatus,
    val message: String,
    val data: JSONObject = JSONObject()
) {
    fun toJson(): JSONObject = JSONObject()
        .put("requestId", requestId)
        .put("status", status.name.lowercase())
        .put("message", message)
        .put("data", data)

    companion object {
        fun success(requestId: String, message: String, data: JSONObject = JSONObject()) =
            CompanionResult(requestId, CompanionStatus.SUCCESS, message, data)

        fun failure(requestId: String, message: String) =
            CompanionResult(requestId, CompanionStatus.FAILURE, message)

        fun needsPermission(requestId: String, permission: String, message: String) =
            CompanionResult(
                requestId,
                CompanionStatus.NEEDS_PERMISSION,
                message,
                JSONObject().put("permission", permission)
            )

        fun needsConfirmation(requestId: String, message: String, data: JSONObject = JSONObject()) =
            CompanionResult(requestId, CompanionStatus.NEEDS_CONFIRMATION, message, data)

        fun unsupported(requestId: String, action: String) =
            CompanionResult(
                requestId,
                CompanionStatus.UNSUPPORTED,
                "Action '$action' is not supported by this Companion version."
            )
    }
}
