# DeskDear Tool Surface

## Purpose

DeskDear is the local execution boundary for Nally. Nally plans and orchestrates tasks; DeskDear decides whether a requested operation is permitted on the user's computer and executes only typed, bounded operations.

This design is inspired by the general concept of remote computer-use agents, but it is an original DeskDear capability model, protocol, naming scheme, and safety policy. It does not copy another product's API, implementation, branding, or documentation.

DeskDear should not expose one unrestricted `computer` or `shell` capability. It should expose narrowly scoped tools that can be granted, denied, revoked, audited, and disabled independently.

## Design principles

1. **Deny by default.** Unknown tools, unknown actions, malformed arguments, expired sessions, and missing permissions fail closed.
2. **Typed operations only.** Every operation has a version, operation ID, session ID, capability, typed arguments, deadline, and idempotency behavior.
3. **Least privilege.** A session receives only the capabilities needed for the current task.
4. **Visible and reversible.** Sensitive activity is visible locally, cancellable, and recorded in the audit log.
5. **No arbitrary remote shell.** Shell access is not a first-release capability.
6. **Local policy wins.** Nally may request an operation, but DeskDear enforces the final local policy.
7. **One operation at a time initially.** Requests are serialized per session unless a capability explicitly supports safe concurrency.
8. **Bounded results.** Output, images, text, duration, and resource use have hard limits.
9. **Privacy by design.** Screen content, clipboard data, credentials, and personal files are not collected implicitly.
10. **Independent emergency stop.** The local user can immediately pause or revoke all remote execution.

## Capability catalogue

### 1. `device.status`

Read-only health and connection information.

| Action | Arguments | Approval | Result |
|---|---|---:|---|
| `get` | none | No | Agent version, platform, connection state, active session summary, policy state |
| `diagnostics` | optional category | No | Bounded diagnostics with secrets and personal data redacted |

This capability must never return private files, screen pixels, tokens, environment variables, or unrestricted process lists.

### 2. `workspace.files`

Read and modify files only inside user-configured workspace roots.

| Action | Arguments | Approval | Result |
|---|---|---:|---|
| `read` | relative path, byte range | Configurable | Bounded text or binary metadata/content |
| `write` | relative path, content, create mode | Yes for new or destructive writes | Write receipt, hash, byte count |
| `list` | relative directory, pagination | No | Names, types, sizes, timestamps within configured root |
| `stat` | relative path | No | Type, size, timestamps, hash if allowed |
| `mkdir` | relative path | Yes | Creation receipt |
| `move` | source and destination relative paths | Yes | Move receipt |
| `delete` | relative path | Always | Deletion receipt; trash/recovery preferred |

Rules:

- Absolute paths are rejected.
- `..` traversal is rejected.
- Symlink and junction escapes are rejected after canonical resolution.
- Workspace roots are configured locally and shown to the user.
- Default maximum file size is 1 MiB for the first release.
- Hidden/system directories and credential files are denied by default.
- Every mutation is logged with path, operation, actor, result, and content hash where appropriate.

### 3. `application.launch`

Open a user-approved application or URL through a local allow-list.

| Action | Arguments | Approval | Result |
|---|---|---:|---|
| `open_app` | registered application ID | Yes initially | Process/application launch receipt |
| `open_url` | URL and optional browser profile | Always for non-local or external URLs | Normalized URL and launch receipt |
| `focus_app` | registered application ID | No/Configurable | Focus receipt |

DeskDear must not accept an arbitrary executable path or arbitrary command-line string. Application registrations are local policy objects with executable identity, allowed arguments, and optional URL schemes.

### 4. `screen.observe`

Read-only visual observation of the desktop.

| Action | Arguments | Approval | Result |
|---|---|---:|---|
| `capture` | display ID, optional region, scale | Always initially | Single bounded image with capture metadata |
| `inspect_region` | display ID, region | Always initially | Cropped image with coordinates |
| `cursor` | display ID | Configurable | Cursor position and display ID |

Safety requirements:

- No silent screen capture in the initial release.
- The local UI shows an active capture indicator.
- Capture is disabled while the device is locked unless the user explicitly configures otherwise.
- Maximum resolution, frequency, and retention are bounded.
- Images are not persisted locally by default.
- Sensitive-window exclusion and privacy masking are future requirements.

### 5. `input.pointer`

Bounded mouse/pointer operations for a user-approved active session.

| Action | Arguments | Approval | Result |
|---|---|---:|---|
| `move` | display ID, coordinate | Yes for session; emergency stop available | Pointer position |
| `click` | display ID, coordinate, button, count, modifiers | Yes for every operation initially | Click receipt |
| `drag` | display ID, start, end, duration | Always initially | Drag receipt |
| `scroll` | display ID, coordinate, direction, amount | Yes for session | Scroll receipt |

Coordinates must be validated against the current display geometry. DeskDear should reject operations on displays that changed since the last observation. No input is accepted when the session is paused, the emergency stop is active, or the user has revoked control.

### 6. `input.keyboard`

Keyboard input for an active, locally approved session.

| Action | Arguments | Approval | Result |
|---|---|---:|---|
| `text` | Unicode text, maximum length | Always initially | Character count; never echo sensitive text |
| `key` | allow-listed key or chord, repeat count | Always initially | Key receipt |
| `hold` | allow-listed key, duration | Always initially | Hold receipt |

The first release should deny key input to password fields where the platform can identify them. DeskDear must never log raw typed text. Clipboard injection is not part of the initial surface.

### 7. `task.control`

Control the current remote task, not the operating system.

| Action | Arguments | Approval | Result |
|---|---|---:|---|
| `pause` | session ID | No | Paused state |
| `resume` | session ID | Local approval if input tools are active | Resumed state |
| `cancel` | operation/session ID | No | Cancellation result |
| `wait` | bounded duration | No | Current session state |

`wait` is a bounded coordination primitive. It must not be used to bypass deadlines or keep a session alive indefinitely.

### 8. `approval.request`

Create a user-facing approval request for a sensitive operation. This is an internal coordination capability and should not be granted to Nally as a free-form tool.

The approval prompt must show:

- What will happen.
- Which application, display, file, or URL is affected.
- The requesting account and device.
- Whether the action is reversible.
- A clear approve-once, deny, and revoke option.

Approval tokens are single-use, operation-specific, short-lived, and cannot be transferred to another operation.

## Explicitly excluded from the initial surface

The following are not exposed in the first remotely useful release:

- Arbitrary shell or PowerShell execution.
- Arbitrary executable paths.
- Unrestricted filesystem access.
- Silent screenshots or continuous desktop recording.
- Credential extraction, keylogging, or password-store access.
- Clipboard read/write by default.
- Process termination or service management.
- Registry editing or system configuration changes.
- Package installation or software updates initiated remotely.
- Email, banking, payments, social-media posting, or government submissions without a separate high-risk workflow.
- Hidden persistence, privilege escalation, security-tool disabling, or firewall changes.

A future `command.sandbox` capability may be considered only after a real sandbox, resource limits, path/network policy, approval flow, and adversarial testing exist. It must not be implemented as direct `system()` or `CreateProcess()` passthrough.

## Tool envelope

All remote operations use a versioned envelope. The operation payload is capability-specific and must not be represented by a generic string pair such as `action` and `content` in the long term.

```json
{
  "protocol_version": 1,
  "message_id": "msg_01...",
  "correlation_id": "task_01...",
  "operation_id": "op_01...",
  "session_id": "ses_01...",
  "capability": "workspace.files",
  "action": "read",
  "arguments": {
    "path": "project/README.md",
    "max_bytes": 65536
  },
  "deadline": "2026-11-26T19:30:00Z",
  "idempotency_key": "idem_01...",
  "requested_approval": false
}
```

Results are structured and bounded:

```json
{
  "protocol_version": 1,
  "operation_id": "op_01...",
  "status": "succeeded",
  "error_code": null,
  "summary": "Read 2,184 bytes",
  "data": {
    "path": "project/README.md",
    "content_encoding": "utf-8",
    "content": "..."
  },
  "audit_event_id": "audit_01..."
}
```

Errors must use stable codes such as `unauthenticated`, `session_expired`, `capability_denied`, `approval_required`, `invalid_arguments`, `deadline_exceeded`, `target_changed`, `size_limit_exceeded`, `replay_detected`, and `local_revocation`.

## Exposure phases

### Phase 0: foundation and simulator

Expose only:

- `device.status.get`
- `workspace.files.read`
- `workspace.files.write`
- `workspace.files.list`
- `workspace.files.stat`
- `task.control.wait`

Test malformed envelopes, traversal, symlink escapes, duplicate IDs, replay, deadlines, size limits, concurrent requests, restart behavior, and revocation.

### Phase 1: safe local desktop integration

Add:

- `application.launch.open_app`
- `application.launch.open_url`
- Local approval UI.
- Audit viewer.
- Per-capability enable/disable settings.

Do not add screen or keyboard control yet.

### Phase 2: observation

Add:

- `screen.observe.capture`
- `screen.observe.inspect_region`
- `screen.observe.cursor`

Require visible local capture status, bounded images, retention controls, and privacy tests.

### Phase 3: controlled interaction

Add:

- `input.pointer.move`
- `input.pointer.click`
- `input.pointer.scroll`
- `input.pointer.drag`
- `input.keyboard.text`
- `input.keyboard.key`
- `input.keyboard.hold`

Require a local “remote control active” indicator, emergency stop, session timeout, target-display validation, and operation-by-operation audit events.

### Phase 4: hardened workflows

Consider narrowly defined workflows such as opening a registered application and completing a local task. Each workflow should be a typed adapter with its own policy rather than a shortcut around the primitive controls.

Arbitrary command execution remains deferred until a separate sandbox project proves isolation and recovery.

## Local permission profiles

DeskDear should provide named profiles rather than a single all-or-nothing switch:

- **Status only:** device status and diagnostics.
- **Workspace assistant:** bounded workspace read/write; no GUI control.
- **Observer:** screen observation with visible indicator; no input.
- **Guided operator:** observation plus pointer/keyboard control, always locally visible.
- **Paused:** no remote operations except status and local revocation.

The default profile is **Status only**. A user must explicitly enable broader profiles on the desktop. Profiles do not override per-operation approval for high-risk actions.

## Implementation roadmap

1. Replace the current generic `target` and `content` fields with a typed argument model while keeping a compatibility adapter for simulator tests.
2. Introduce a registry mapping `capability + action` to an adapter, validator, risk level, and result-size limit.
3. Add idempotency and replay tracking with bounded persistent storage.
4. Add an operation result/error schema and audit event schema.
5. Add a local permission-profile store and UI.
6. Implement `device.status` and `workspace.files` against the existing simulator security checks.
7. Add the local approval broker and connect approval state to the Qt UI.
8. Add application launching through platform-specific allow-listed adapters.
9. Add observation only after capture privacy and retention controls are tested.
10. Add pointer and keyboard control only after emergency stop, session timeout, target validation, and adversarial tests pass.
11. Connect the capability registry to the NallyHermes transport only after local simulator and desktop tests are stable.

## Acceptance criteria before connecting to NallyHermes

- Unknown capability and unknown action are rejected.
- Every operation has a deadline and cannot run after it expires.
- Duplicate operation IDs cannot execute twice.
- Replayed messages are rejected.
- Session revocation stops queued and active work as quickly as the platform allows.
- User approval is bound to one exact operation.
- Screen capture has a visible local indicator and bounded retention.
- Input control has a working emergency stop on Windows and Linux.
- Workspace operations cannot escape configured roots through traversal, symlinks, junctions, or renamed targets.
- Results and audit events are bounded and redact secrets.
- Agent restart does not silently restore a remote session or permissions.
- The tester agent has attempted misuse, prompt injection through files/web pages, malicious URLs, destructive file operations, fake approval events, and connection interruption.
