package com.klyntech.nallyhermes.companion

import android.content.Context
import com.klyntech.nallyhermes.companion.protocol.CompanionRequest
import com.klyntech.nallyhermes.companion.protocol.CompanionResult

/**
 * Confirmation policy for a capability.
 * - SILENT: execute immediately (reads, non-destructive)
 * - SOFT: execute but surface a short confirmation in UI when possible
 * - HARD: require explicit user confirmation before execution
 */
enum class ConfirmationTier {
    SILENT,
    SOFT,
    HARD
}

/**
 * One device capability that Nally can invoke.
 */
interface CompanionCapability {
    /** Stable id used in CompanionRequest.action (e.g. "get_battery"). */
    val id: String

    /** Human-readable name for settings / debug UI. */
    val displayName: String

    /** Short description shown to the user. */
    val description: String

    val confirmationTier: ConfirmationTier

    /**
     * Runtime permission this capability needs, or null if none.
     * The service will check and return NEEDS_PERMISSION when missing.
     */
    val requiredPermission: String?

    /**
     * Execute the action. Implementations must be safe to call from a background thread.
     */
    suspend fun execute(context: Context, request: CompanionRequest): CompanionResult
}
