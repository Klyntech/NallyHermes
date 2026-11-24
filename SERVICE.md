# Service branch: NallyDeskDear

**Base:** `main`  
**Pattern:** same as `NallPuter` / `NallyCreepyCrawley` — dedicated service branch.

| | |
|--|--|
| **Product** | NallyDeskDear |
| **Role** | Desktop device agent — full computer use (apps, terminal, later UI) under approval |
| **Control plane** | NallyHermes mainline + Device System (`Grok-Device-System-3.7`) |
| **Siblings** | `NallPuter`, `NallyCreepyCrawley`, `NallyMobileCompanion` |

## Build on this branch

1. DeskDear agent package (Python or Node)
2. Pair / heartbeat / job worker against Device Protocol
3. Capabilities: `health`, workspace I/O, `run_command`, `open_app` → later `screenshot`, `ui_drive`

Mobile work does **not** land here — use `NallyMobileCompanion`.
