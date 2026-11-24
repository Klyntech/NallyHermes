# Nally device products

Branch: `Grok-Device-System-3.7`

Nally cloud (this repo) remains the **control plane**: pairing, approvals, jobs, learning, Agency Graph.

Two **device products** sit on the user’s machines and only execute **operable lines** they advertise.

---

## 1. NallyDeskDear (Desktop)

**Goal:** Full personal computer use on the user’s laptop — under approval.

| Can do | How |
|--------|-----|
| Open apps | `open_app` capability |
| Terminal (scoped) | `terminal` / `run_command` in workspace or allowlist |
| UI drive / screenshot | `ui_drive`, `screenshot` |
| Workspace files | `list/read/write_workspace` |
| Health / heartbeat | Always on |

**Shape:** background service + optional tray UI (Node or Python agent first; native later).

**Trust model:**

- Paired with a one-time code from Telegram / Nally
- Device token stored only on the machine
- Mutating jobs start **queued** until Deny / Allow / Always allow
- Default cwd = `NallyWorkspace` (user-configurable)

**Out of scope for v1:** silent full-disk access, credential stuffing, bypassing OS login.

---

## 2. NallyHermes Mobile Companion

**Goal:** Companion to the **existing Android app** — not a second full phone OS controller.

Like a small side process / module the Android app hosts (or a lightweight helper), focused on **observe + capture**, not unlock / full drive.

| Can do | How |
|--------|-----|
| Notify | Local notifications |
| Photos / files user grants | `read_photos`, `ingest_file` |
| Missed calls (permission) | `read_call_log` + approval |
| Voice capture when user starts it | `capture_voice` |
| Health | battery, network, agent online |

**Explicitly not:**

- Unlocking the phone
- Silent full UI takeover
- Sending SMS / placing calls without a later explicit product decision

**Shape:** Companion module inside or beside the current Android client; talks the same **Device Protocol** as DeskDear.

---

## Shared Device Protocol

Both products speak one protocol to Nally cloud:

1. `POST /device/pair` — pairing code → device id + token  
2. `POST /device/heartbeat` — stay online  
3. `GET  /device/jobs` — pull approved jobs  
4. `POST /device/jobs/:id/complete` — result or error  
5. Capabilities advertised at pair / refresh time  

Cloud schema already (branch): `devices`, `device_jobs`, `device_pairing_codes` + `device_manage` tool.

---

## Build order

1. **Protocol + HTTP surface** on NallyHermes (pair, heartbeat, claim, complete)  
2. **NallyDeskDear** minimal agent (Python or Node): pair, heartbeat, `health`, `run_command` workspace-scoped  
3. **Mobile Companion** contract in Android: pair with existing session, `notify`, `ingest_file`  
4. Expand desktop: `open_app`, `screenshot`, `ui_drive`  
5. Expand mobile: `read_photos`, `read_call_log` (gated)  

---

## Naming

| Product | Package / folder |
|---------|------------------|
| Desktop agent | `products/nally-deskdear/` |
| Mobile companion contract | `products/nally-mobile-companion/` |
| Shared types / OpenAPI sketch | `products/device-protocol/` |
