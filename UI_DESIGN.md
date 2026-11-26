# DeskDear UI design

## Product posture

DeskDear should feel calm, precise, and trustworthy rather than like a system utility that constantly demands attention. The interface is a command center for a remote desktop agent, but the agent should normally stay out of the way. The user opens the interface when they want to pair, inspect permissions, approve an action, or review activity.

The design takes inspiration from the agent-first command-center direction of Google Antigravity: conversations and active work are the center of gravity, the interface is abstracted away from operating-system details, and progress is represented as clear work states. DeskDear will use its own visual identity and will not copy Google branding or proprietary screens.

## Shared design decision

Windows and Linux should use the same Qt Quick/QML presentation layer, layout, labels, colors, spacing, icons, and interaction model. Platform-specific code should be limited to the native service lifecycle, system notification adapter, secure credential storage, and desktop integration.

The UI should not branch into separate Windows and Linux designs. A user should be able to move between both platforms and immediately understand the same concepts.

## Silent background mode

DeskDear should support a default `silent background` mode:

- The agent starts with the operating system.
- No main window opens automatically.
- No tray icon is required.
- On the first successful connection, the operating system displays a native notification: `DeskDear connected`.
- Reconnects do not repeatedly notify the user unless the connection has been offline for a meaningful interval.
- The notification contains no sensitive task, file, account, or location information.
- Selecting the notification opens the DeskDear status window.
- The user can explicitly enable an optional tray/menu-bar entry from Settings.
- A local emergency-stop action remains available through the status window and a platform shortcut or command-line fallback.

The first-run pairing flow is the exception. Pairing requires a visible window because it needs device naming, approval, and confirmation. After pairing, DeskDear returns to silent background mode.

## Platform behavior

On Windows, DeskDear should run as a per-user background process or user service and use the native Windows notification system. It should not add an inbound firewall rule. The optional tray icon is disabled by default.

On Linux, DeskDear should run as a `systemd --user` service inside the logged-in desktop session and use the standard desktop notification D-Bus interface. GNOME and KDE should receive the same notification content. The optional StatusNotifier/AppIndicator entry is disabled by default.

If native notifications are unavailable, the agent should continue operating and record the event in the local audit log. It must not open a window unexpectedly as a fallback.

## Visual language

Use a dark-first interface with a quiet near-black canvas, soft graphite panels, and one restrained signal color. The signal color is a warm electric amber called `Nally Gold`; it represents attention and active work rather than generic success. Connection success uses a muted mint accent, errors use a clear coral accent, and neutral information uses cool blue-gray.

Typography should be modern and highly legible. Use a system sans-serif stack so the same design feels native on Windows and Linux. Use a compact uppercase eyebrow for context, large sentence-case titles, and short descriptive copy. Avoid dense dashboards, glossy gradients, excessive rounded cards, and decorative animation.

Core tokens:

```text
Canvas:       #0D0F12
Panel:        #15181D
Panel raised: #1C2027
Border:       #2A3038
Text primary: #F2F4F7
Text muted:   #9AA3AF
Mint:         #A7E8C3
Nally Gold:   #E9B872
Coral:        #F28F8F
Blue gray:    #9DB7D3
Radius:       14px panels, 10px controls, 999px status pills
Spacing:      4 / 8 / 12 / 16 / 24 / 32px
```

## Main window

The main window is a compact command center with three regions.

The left rail contains the DeskDear mark, the current device name, and four destinations: Overview, Activity, Permissions, and Settings. It is narrow and quiet. The rail can collapse to icons without changing the content model.

The center surface is the active page. The Overview page begins with a small status eyebrow such as `DESKDEAR / HOME DESKTOP`, a title such as `Your computer is ready`, and one sentence explaining the current state. Below it is a large connection card showing `Connected`, the last heartbeat, and the active session state. The most important action is always visually obvious: `Stop session`, `Review permissions`, or `Pair device` depending on state.

The right side is a contextual activity column. It shows the current task, pending approval, or the latest safe event. It should never become a noisy log by default. A `View all activity` action opens the complete audit view.

## Key states

### Connected

Display a mint status dot, `Connected`, the device name, and the last heartbeat. Show the current control mode as `Waiting for tasks`.

### Working

Display `Nally is working on your computer`, the current operation, elapsed time, and a clear `Stop` action. Do not show raw protocol details unless the user opens diagnostics.

### Approval required

Elevate the pending approval into the center surface. Explain what will happen in plain language, identify the capability being requested, show the scope and expiry, and offer `Allow once` and `Deny`. Never hide a high-impact action behind a generic confirmation label.

### Offline

Display `DeskDear is offline`, the last successful connection time, and `Reconnect automatically` state. Do not imply that queued remote work will run unless a future protocol explicitly supports safe queuing.

### Pairing

Use a focused, distraction-free flow with a pairing code or QR code, device name, account identity, requested permissions, and a final local approval step.

## Notification copy

The default connection notification should be short:

```text
DeskDear connected
Your computer is ready for approved tasks from Nally.
```

The reconnect notification should be used sparingly:

```text
DeskDear reconnected
Your computer is available again.
```

The approval notification may identify the operation category but must not expose private file names or sensitive content in the notification preview:

```text
DeskDear needs approval
Nally is requesting a workspace action on this computer.
```

## Accessibility and trust

Every status must be represented by text as well as color. Keyboard navigation must reach every control. Approval buttons must be explicit and have safe focus defaults. The stop action must be reachable without navigating through multiple pages. The UI must remain usable at increased system font sizes and should not rely on animation to communicate state.

The UI should make the trust boundary visible: `Nally plans`, `DeskDear checks`, and `You approve`. This language should appear in the Permissions and Activity pages so users understand that a remote instruction is not automatically an authorization.

## Implementation sequence

First implement the shared QML shell with Overview, Activity, Permissions, Settings, and the pairing state. Use a local mock state provider so the UI can be reviewed without transport. Then connect the shell to the C++ agent through a narrow local IPC interface. Native notification adapters and startup services should be added only after the mock states and permission-review flow are stable.
