# Nally Mobile Companion

Device-control layer that lets Nally interact with the user's Android phone through structured, permission-bounded actions.

> The Android app is Nally's interface.  
> The Companion is what gives Nally controlled access to device capabilities.

## Status (scaffold)

First wave of capabilities is implemented and callable from Kotlin:

| Action id         | Description                          | Confirmation | Permission |
|-------------------|--------------------------------------|--------------|------------|
| `get_battery`     | Battery level + charging state       | silent       | none       |
| `set_volume`      | Media / ring / alarm / notification  | soft         | none       |
| `set_flashlight`  | Torch on / off                       | soft         | none*      |
| `launch_app`      | Open app by package or friendly name | soft         | none       |

\* Flashlight uses `CameraManager.setTorchMode`; most devices do not require the `CAMERA` permission for torch-only use.

## Protocol

### Request

```json
{
  "requestId": "uuid-or-any-unique-string",
  "action": "set_volume",
  "params": {
    "stream": "music",
    "percent": 50
  }
}
```

### Result

```json
{
  "requestId": "uuid-or-any-unique-string",
  "status": "success",
  "message": "Set music volume to 50%.",
  "data": {
    "stream": "music",
    "volume": 7,
    "max": 15,
    "percent": 50
  }
}
```

Possible `status` values:

- `success`
- `failure`
- `needs_permission`
- `needs_confirmation`
- `unsupported`

## Kotlin usage

```kotlin
// One-shot
val request = CompanionRequest(
    requestId = UUID.randomUUID().toString(),
    action = "get_battery"
)
val result = NallyMobileCompanion.execute(context, request)

// Or from JSON (e.g. payload arriving from the agent)
val result = NallyMobileCompanion.executeJson(context, jsonObject)

// Catalogue for tool discovery / settings UI
val catalogue = NallyMobileCompanion.catalogue()
```

You can also bind to `NallyMobileCompanionService` if you prefer a service-lifecycle boundary.

## Package layout

```
com.klyntech.nallyhermes.companion/
├── NallyMobileCompanion.kt              // public entry point
├── NallyMobileCompanionService.kt       // bound service (not exported)
├── CompanionCapability.kt               // capability interface + ConfirmationTier
├── CompanionCapabilityRegistry.kt       // central registry
├── protocol/
│   └── CompanionProtocol.kt             // CompanionRequest / CompanionResult
└── actions/
    ├── GetBatteryAction.kt
    ├── SetVolumeAction.kt
    ├── SetFlashlightAction.kt
    └── LaunchAppAction.kt
```

## Next steps

1. Wire a debug / settings panel that lists the catalogue and lets you fire test requests.
2. Expose a server-side tool schema so the agent can emit CompanionRequests.
3. Add confirmation UI for `SOFT` / `HARD` tiers.
4. Grow the action set (screenshot via MediaProjection, notifications via NotificationListenerService, photo search via MediaStore, etc.).
5. Optional: elevate the service to foreground when long-lived listeners are required.

## Security notes

- The service is **not exported**. Only the NallyHermes process can bind.
- Every capability declares its required permission; the gate runs before execution.
- The agent can only call action ids that exist in `CompanionCapabilityRegistry`.
- Prefer expanding the registry over ad-hoc Intent firing from other layers.
