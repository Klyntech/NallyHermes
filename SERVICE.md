# Service branch: NallyMobileCompanion

**Base:** `android-native-app`  
**Pattern:** same as `NallPuter` / `NallyCreepyCrawley` — dedicated service branch.

| | |
|--|--|
| **Product** | NallyHermes Mobile Companion |
| **Role** | Companion module for the existing Android app — limited phone use |
| **Base app** | This branch starts from `android-native-app` |
| **Control plane** | NallyHermes Device Protocol (pair, jobs, approvals) |
| **Siblings** | `NallyDeskDear`, `NallPuter`, `NallyCreepyCrawley` |

## Build on this branch

1. Companion hooks inside / beside the Android client
2. Capabilities: `health`, `notify`, `ingest_file`, `read_photos`, `read_call_log`
3. **Never:** unlock device, full phone UI drive in v1

Desktop computer-use lives on **NallyDeskDear**, not here.
