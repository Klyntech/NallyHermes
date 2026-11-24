# Nally device products

Cloud/device **kernel** work stays on `Grok-Device-System-3.7`.

The two device **products** are **separate service branches** (same idea as `NallPuter` and `NallyCreepyCrawley`):

| Product | Service branch |
|---------|----------------|
| **NallyDeskDear** | [`NallyDeskDear`](https://github.com/Klyntech/NallyHermes/tree/NallyDeskDear) |
| **NallyHermes Mobile Companion** | [`NallyMobileCompanion`](https://github.com/Klyntech/NallyHermes/tree/NallyMobileCompanion) |

| Supporting | Branch |
|------------|--------|
| Existing Android app | `android-native-app` |
| Virtual computer kernel | `NallPuter` |
| Crawler | `NallyCreepyCrawley` |

Shared protocol draft:

- `products/device-protocol/PROTOCOL.md`

## Responsibility split

- **Grok-Device-System-3.7 / mainline agent** — `devices`, `device_jobs`, pairing, `device_manage`, HTTP `/v1/device/*`, approvals  
- **NallyDeskDear** — desktop agent binary/service (full computer use under approval)  
- **NallyMobileCompanion** — Android companion module (limited phone use; no unlock)  
