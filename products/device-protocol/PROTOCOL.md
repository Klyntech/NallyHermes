# Nally Device Protocol v0.1

Shared by **NallyDeskDear** and **NallyHermes Mobile Companion**.

Base URL: NallyHermes HTTP origin (same host as mobile API).
Auth after pairing: `Authorization: Bearer <device_token>`.

---

## Pair

```
POST /v1/device/pair
Body: { "code": "a1b2c3", "capabilities": ["health", "run_command"], "label": "ThinkPad" }
→ { "device_id": "…", "token": "…", "telegram_id": "…" }
```

Code comes from Telegram / `device_manage` operation `pair`. Token shown **once**.

---

## Heartbeat

```
POST /v1/device/heartbeat
Headers: Authorization: Bearer <token>
Body: { "capabilities"?: string[] }  // optional refresh
→ { "status": "online", "device_id": "…" }
```

Recommended every 30–60s.

---

## Claim jobs

```
GET /v1/device/jobs?limit=5
→ { "jobs": [ { "id", "capability", "summary", "payload" } ] }
```

Only **approved** jobs. Claiming marks them `running`.

---

## Complete job

```
POST /v1/device/jobs/:id/complete
Body: { "ok": true, "result": { … } } | { "ok": false, "error": "…" }
→ { "job": { "id", "status" } }
```

---

## Capability registry (v0.1)

### Desktop (DeskDear)

| Capability | Mutating | Notes |
|------------|----------|--------|
| `health` | no | |
| `list_workspace` | no | |
| `read_workspace` | no | |
| `write_workspace` | yes | |
| `run_command` | yes | cwd = workspace unless allowlisted |
| `open_app` | yes | |
| `screenshot` | yes | privacy-sensitive |
| `ui_drive` | yes | computer-use style |

### Mobile Companion

| Capability | Mutating | Notes |
|------------|----------|--------|
| `health` | no | |
| `notify` | no | |
| `ingest_file` | yes | user-picked or granted |
| `read_photos` | yes | gallery permission |
| `read_call_log` | yes | always approval |
| `capture_voice` | yes | user-initiated |

**Never:** `unlock_device`.

---

## Job payload examples

```json
{ "capability": "run_command", "payload": { "command": "npm test", "cwd": "." } }
{ "capability": "open_app", "payload": { "app": "code", "args": ["."] } }
{ "capability": "notify", "payload": { "title": "Nally", "body": "Job finished" } }
{ "capability": "read_call_log", "payload": { "since_hours": 24 } }
```
