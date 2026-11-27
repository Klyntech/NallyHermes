# DeskDear UI design

## Product posture

DeskDear should feel calm, precise, and trustworthy rather than like a system utility that constantly demands attention. The interface is a command center for a remote desktop agent, but the agent should normally stay out of the way. The user opens the interface when they want to pair, inspect permissions, approve an action, or review activity.

## Shared design decision

**One design system across products.** DeskDear desktop (Windows + Linux) uses the same visual tokens as the Android native app (`android-native-app` branch, `ui/theme/Theme.kt` / `NallyHermesTheme`). Platform-specific code is limited to service lifecycle, notifications, credential storage, and desktop integration.

Windows and Linux share one Qt Quick/QML presentation layer. A user moving between Android and DeskDear should recognize the same surfaces, type scale intent, and accent language.

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

## Visual language (Android design system)

Source of truth: `android/app/src/main/java/com/klyntech/nallyhermes/ui/theme/Theme.kt`

Dark-first, quiet olive-graphite surfaces, sage primary, soft error coral. Typography targets Manrope on Android; desktop uses the system sans stack with the same weight and size intent.

### Core tokens

```text
Canvas (hard):        #0B0C0B
Background:           #191A18
Panel (surface):      #232521
Raised (surfaceVar):  #2B2D28
Primary container:    #343B30
Border (outlineVar):  #3D403A
Outline:              #777A72

Text primary:         #F1F2ED
Text muted:           #A7AAA3

Primary (sage):       #A7B09A
On primary:           #252B20
Success / connected:  #A7B09A
Attention:            #C9C4A8
Danger / error:       #F2B8B5
On danger:            #601410
Info:                 #A7AAA3

Radius:               14px panels, 10px controls, 999px pills
Spacing:              4 / 8 / 12 / 16 / 24 / 32px
```

DeskDear maps product signals onto this palette:

| Signal | Token |
|--------|--------|
| Connected / healthy | `primary` / success sage |
| Needs attention / active work | `attention` warm neutral |
| Error / stop | `danger` |
| Neutral meta | `muted` / `info` |

Avoid glossy gradients, excessive rounded cards, and decorative animation. Status must always include text, not color alone.

## Main window (desktop layout)

The main window is a compact command center with three regions.

**Left rail** — DeskDear mark, current device name, destinations: Overview, Activity, Permissions, Settings. Narrow and quiet; can collapse to icons later.

**Center surface** — active page. Overview starts with a small status eyebrow (`DESKDEAR / HOME DESKTOP`), a sentence-case title, and one explanatory line. Large connection card shows Connected, heartbeat, and session state. Primary actions stay obvious: Stop session, Review permissions, or Pair device.

**Right column** — contextual activity: current task, pending approval, or latest safe events. Not a noisy log by default.

## Key states

### Connected
Mint/sage status dot, `Connected`, device name, last heartbeat. Control mode: `Waiting for tasks`.

### Working
`Nally is working on your computer`, current operation, elapsed time, clear `Stop`.

### Approval required
Elevate into the center surface. Plain language, capability, scope, expiry. `Allow once` / `Deny`.

### Offline
`DeskDear is offline`, last successful connection, automatic reconnect state.

### Pairing
Focused flow: code or QR, device name, account, requested permissions, local approval.

## Notification copy

```text
DeskDear connected
Your computer is ready for approved tasks from Nally.

DeskDear reconnected
Your computer is available again.

DeskDear needs approval
Nally is requesting a workspace action on this computer.
```

## Accessibility and trust

Every status is text as well as color. Keyboard reaches every control. Stop is reachable without deep navigation. Trust boundary language stays visible: **Nally plans → DeskDear checks → You approve**.

## Implementation sequence

1. Shared QML shell with Android tokens (done in `ui/qml/Main.qml`).
2. Mock state provider for Overview / Activity / Permissions / Settings / pairing.
3. Narrow local IPC to the C++ agent.
4. Native notification adapters and startup services after permission-review is stable.
