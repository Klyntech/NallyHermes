# NallyHermes Mobile Companion

Companion module for the **existing Android app** — limited phone use.

## Role

Extends the current Android client so the phone is a first-class **device** in the Device Kernel: pair (or link to existing mobile session), heartbeat, execute only mobile capabilities.

## v1 target capabilities

1. `health`
2. `notify`
3. `ingest_file` (share sheet / picker)
4. `read_photos` (permission-gated)
5. `read_call_log` (permission + always approval)
6. `capture_voice` (user-started)

## Explicit non-goals

- Unlock phone
- Full UI automation of the handset
- Background SMS / dialer control in v1

## Integration options

| Option | When |
|--------|------|
| **A. In-app module** | Preferred — same process as current Android app, shared login |
| **B. Side service** | If we need a long-lived worker isolated from UI |

Companion should reuse existing mobile auth where possible; device token can be derived or stored after “Enable device agent” in settings.

## Contract

Same **Device Protocol** as DeskDear (`products/device-protocol/PROTOCOL.md`).

Android implements:

- Pair or bind device record
- WorkManager / foreground service for heartbeat + job pull
- Capability handlers mapped to system APIs (MediaStore, CallLog, NotificationManager)

## Layout

```
products/nally-mobile-companion/
  README.md
  CONTRACT.md             # next: Android interface list
```
