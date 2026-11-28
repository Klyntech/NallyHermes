package com.klyntech.nallyhermes.companion

import com.klyntech.nallyhermes.companion.actions.GetBatteryAction
import com.klyntech.nallyhermes.companion.actions.LaunchAppAction
import com.klyntech.nallyhermes.companion.actions.SetFlashlightAction
import com.klyntech.nallyhermes.companion.actions.SetVolumeAction

/**
 * Central registry of all device capabilities the Companion exposes.
 * The agent can only invoke actions that appear here.
 */
object CompanionCapabilityRegistry {

    private val capabilities: Map<String, CompanionCapability> = listOf(
        GetBatteryAction(),
        SetVolumeAction(),
        SetFlashlightAction(),
        LaunchAppAction()
    ).associateBy { it.id }

    fun get(actionId: String): CompanionCapability? = capabilities[actionId]

    fun all(): Collection<CompanionCapability> = capabilities.values

    fun ids(): Set<String> = capabilities.keys

    /** Human-readable catalogue useful for settings UI or agent tool discovery. */
    fun catalogue(): List<Map<String, String>> = capabilities.values.map {
        mapOf(
            "id" to it.id,
            "name" to it.displayName,
            "description" to it.description,
            "confirmation" to it.confirmationTier.name.lowercase()
        )
    }
}
