# NallyDeskDear Project Plan

## Product direction

DeskDear is the trusted desktop endpoint that lets a user ask Nally, from a mobile app or Telegram while away from home, to perform an approved task on their computer. For example, the user may be in Berlin while DeskDear is running on their computer in Nigeria.

Nally remains the reasoning, planning, conversation, and orchestration layer. DeskDear does not decide what the user meant and does not receive unrestricted shell access. DeskDear exposes a small, visible, revocable capability surface and executes only authenticated, authorized operations.

The product should feel like a remote computer-use agent, similar in spirit to Codex computer workflows or Claude Computer Use, but with a stronger separation between:

- **Intent and planning:** Nally / NallyHermes.
- **Authorization and execution:** DeskDear on the user's desktop.
- **User approval and visibility:** the local desktop endpoint.

## Target operating model

1. The user sends an instruction through the Nally mobile app or Telegram.
2. Nally authenticates the user and converts the request into a structured task plan.
3. Nally requests a short-lived execution session with DeskDear.
4. DeskDear verifies the control-plane identity, session scope, expiry, and requested capabilities.
5. DeskDear asks for local approval when the capability or action requires it.
6. DeskDear executes one bounded operation at a time and returns structured results.
7. Nally observes the result, decides the next step, and reports progress to the user.
8. The user can revoke the session locally or remotely at any time.

The initial implementation should use an **outbound DeskDear connection** to the NallyHermes control plane. The desktop should not require an inbound port or direct internet exposure.

## Core components

### 1. DeskDear agent

Runs on Windows and Linux desktops. Responsibilities:

- Maintain a local device identity.
- Establish an authenticated outbound connection.
- Receive session and operation requests.
- Enforce capability and policy checks locally.
- Present approval prompts and status to the user.
- Execute allow-listed adapters.
- Return structured results, errors, and audit events.

DeskDear must remain useful even if the control plane is unavailable: it should fail closed, preserve local state safely, and make its current connection/session status visible.

### 2. NallyHermes control plane

Responsibilities:

- User and account authentication.
- Telegram/mobile message intake.
- Device pairing and device inventory.
- Session issuance and revocation.
- Task planning and orchestration.
- Operation routing and result collection.
- Audit history and notifications.

The control plane is the source of user intent, but it is not the final authority for local safety-sensitive actions. DeskDear must enforce its own local policy.

### 3. Capability adapters

The first adapters should be narrow and observable:

- `health`: device status and agent diagnostics.
- `workspace.read`: read selected files in an explicitly configured workspace.
- `workspace.write`: create or modify files in an explicitly configured workspace.
- `application.open`: open a user-approved application or URL.
- `command.run`: defer until a robust approval and sandbox policy exists.
- `screen.capture`: defer until privacy indicators, consent, and retention controls exist.
- `input.control`: defer until strong user-presence and emergency-stop behavior exists.

Do not expose arbitrary shell execution, unrestricted filesystem access, silent screenshots, or invisible input control in the first release.

## Security model

### Identity

The persistent device ID identifies a device but is not a credential. Authentication should use device keys stored in an OS-protected keystore where available. The control plane must be able to revoke a device key without relying on the device ID as proof.

### Pairing

Pairing must require:

- An authenticated Nally account.
- A short-lived pairing code or QR flow.
- Explicit confirmation on the local desktop.
- A clear device name and location hint.
- A record of when and by whom the device was paired.

### Sessions

Every execution session must have:

- A unique session ID.
- A short expiry.
- A requested and approved capability set.
- A user/account identity from the control plane.
- A revocation state.
- An audit trail.

No session should inherit permissions from a previous session. DeskDear should fail closed when the session is expired, disconnected, malformed, or revoked.

### Operations

Each operation must be structured rather than an arbitrary remote command. It should include:

- Operation ID and session ID.
- Capability name.
- Typed arguments.
- Idempotency key where relevant.
- Deadline.
- Approval requirement.
- Correlation metadata.

DeskDear must validate all fields before invoking an adapter and must return bounded, typed results. Sensitive output should be redacted or excluded by policy.

### Local user control

The desktop user must be able to:

- See whether the agent is connected.
- See the active session and granted capabilities.
- Approve or deny sensitive operations.
- Revoke the current session.
- Disconnect or disable the agent.
- Review recent operations.

High-risk actions should require approval every time until there is an explicit, user-configured policy allowing a narrower automation mode.

## Recommended protocol shape

Use a versioned, authenticated message envelope over an outbound TLS connection. WebSocket is a reasonable first transport because it supports bidirectional progress and results; the protocol itself must not depend on WebSocket-specific semantics.

Conceptual messages:

- `device.hello`
- `device.pairing.request`
- `device.pairing.approve`
- `session.open`
- `session.revoke`
- `operation.request`
- `operation.approval_required`
- `operation.approve`
- `operation.result`
- `operation.error`
- `device.heartbeat`
- `audit.event`

Every message should include a protocol version, message ID, timestamp, and correlation ID. Replay protection, clock-skew handling, size limits, and request deadlines are required before production use.

## Delivery milestones

### Milestone 0: foundations and threat model

- Keep the current deny-by-default permission model.
- Add formal protocol and threat-model documentation.
- Add deterministic tests for identity, platform detection, CLI behavior, and capability mapping.
- Define error codes and structured result types.
- Remove or isolate unrelated legacy CI workflows from the DeskDear branch.

### Milestone 1: local agent shell

- Add a long-running agent mode with clean shutdown.
- Add local status output and a local control socket/UI abstraction.
- Add configuration loading with safe defaults.
- Add structured logging and a bounded audit log.
- Add explicit workspace-root configuration.

### Milestone 2: secure pairing

- Generate and persist a device key separate from the device ID.
- Implement a short-lived pairing flow.
- Require local approval before completing pairing.
- Add device revocation and key rotation.

### Milestone 3: outbound control-plane session

- Implement the outbound authenticated transport.
- Add heartbeats, reconnect backoff, message limits, deadlines, and revocation handling.
- Add session negotiation with explicit capabilities and expiry.

### Milestone 4: safe computer-use primitives

- Implement `health`.
- Implement workspace read/write within configured roots.
- Implement application opening through a local allow-list.
- Add per-operation approval and audit events.

### Milestone 5: richer computer use

- Add carefully bounded command execution, initially through an explicit allow-list or sandbox.
- Add screen capture only with visible local indicators and retention controls.
- Add input control only with a prominent emergency stop and strict session policy.

### Milestone 6: product integration

- Integrate Telegram and mobile app task intake.
- Add progress updates, approvals, cancellation, retries, and user-facing summaries.
- Add fleet/device management, diagnostics, and upgrade strategy.

## First implementation slice

The next code changes should not start with arbitrary remote shell execution. They should establish the protocol and policy boundaries needed to make later capabilities safe:

1. Define versioned typed operation/request/result structures in the C++ core.
2. Add a policy evaluator that checks session state, capability, expiry, operation deadline, and local approval requirement.
3. Add structured error codes.
4. Add tests for fail-closed behavior and malformed requests.
5. Add a transport interface with no network implementation yet, so protocol logic can be tested independently.

This keeps the current branch honest: it becomes a secure agent foundation rather than prematurely pretending to be a remote-control system.

## Definition of done for the first remotely useful release

A user can pair one desktop from the local UI, see it in Nally, ask Nally to perform a bounded workspace task, approve it locally when required, watch progress from the mobile app or Telegram, and revoke the session. The system must fail closed on expired credentials, lost connectivity, unknown operations, denied capabilities, malformed inputs, and local revocation.
