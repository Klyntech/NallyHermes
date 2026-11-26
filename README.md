# NallyDeskDear

NallyDeskDear is the C++ desktop-agent component of NallyHermes. Nally remains the reasoning and orchestration layer; DeskDear is the separately permissioned desktop endpoint.

## Initial platforms

- Windows
- Linux: Ubuntu GNOME and KDE Plasma (Wayland and X11 support will be handled through platform-specific adapters)

## Build

Requires CMake 3.20+ and a C++20 compiler.

```sh
cmake -S . -B build
cmake --build build --config Release
./build/deskdear --status
```

On Windows, run `build\Release\deskdear.exe --status` for a multi-configuration generator.

## Current implementation

- C++20 executable and CMake build.
- Stable local device identifier, stored in the user's configuration directory.
- Capability model that denies all permissions by default.
- Status and initialization CLI with Windows / GNOME / KDE and Wayland / X11 environment detection.
- Typed operation requests with fail-closed session policy evaluation.
- A headless simulator for health and sandboxed workspace read/write operations.
- CTest coverage for the deny-by-default permission model and session policy.

## Headless simulator and Render

The headless simulator lets us test the DeskDear execution boundary before connecting a real Windows or graphical Linux desktop. See [SIMULATOR.md](SIMULATOR.md) for local commands, sandbox workspace behavior, Docker usage, and the Render Blueprint.

Render is configured as a background worker in `render.yaml`. The worker currently runs in transport-free simulation mode, performs a startup self-test, and emits heartbeats. It does not control a real desktop and does not yet connect to the NallyHermes control plane.

## Shared desktop UI

The Windows and Linux desktop application uses the same Qt Quick/QML interface. The UI build is optional for local core development because Qt is not required by the headless simulator:

```sh
cmake -S . -B build -DDESKDEAR_BUILD_UI=ON
cmake --build build --config Release
```

The `desktop-release.yml` GitHub Action installs Qt, builds and tests the application on Windows and Linux, deploys the Qt runtime, and uploads:

| Platform | Artifact | What you get |
|----------|----------|--------------|
| **Windows** | `DeskDear-windows-x64-Setup.exe` | **Single installable Setup.exe** (NSIS). Double-click to install; Start Menu shortcut; uninstall entry. |
| **Windows** | `DeskDear-windows-x64-portable.zip` | Portable folder (exe + Qt DLLs) for side-by-side testing. |
| **Linux** | `DeskDear-linux-x64.AppImage` | Self-contained AppImage. |
| **Linux** | `DeskDear-linux-x64.tar.gz` | Staged tree for packaging. |

Push a `v*` tag or start the workflow manually (**Actions → DeskDear Desktop Builds → Run workflow**) to produce downloadable artifacts.

### Windows: how to get the installer

1. Open the Actions tab on the repo.
2. Run **DeskDear Desktop Builds** (workflow_dispatch) or push a `v0.1.0`-style tag.
3. Download the **DeskDear-windows-x64** artifact.
4. Inside it you will find **`DeskDear-windows-x64-Setup.exe`** — that is the single installable executable.

Local packaging (Windows, after a UI build):

```pwsh
cmake --install build --config Release --prefix staging
windeployqt --release --qmldir ui/qml staging\bin\deskdear-ui.exe
# Then either zip staging/ or run cpack -G NSIS (NSIS must be installed)
```

## Security boundary

A device identifier is not an authentication credential. Pairing, account authentication, device approval, heartbeat transport, and remote jobs are not yet connected to NallyHermes. No remote command execution, screen capture, or input control is enabled in this milestone. Future capabilities must require an authenticated session and explicit, revocable user approval.

## Planned adapter approach

- Windows: native Windows APIs behind a platform adapter.
- Linux GNOME and KDE: XDG Desktop Portal and PipeWire for supported Wayland workflows; X11-specific support where available.
- Keep the core protocol and permission model independent of desktop environment.
