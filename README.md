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
- CTest coverage for the deny-by-default permission model.

## Security boundary

A device identifier is not an authentication credential. Pairing, account authentication, device approval, heartbeat transport, and remote jobs are not yet connected to NallyHermes. No remote command execution, screen capture, or input control is enabled in this milestone. Future capabilities must require an authenticated session and explicit, revocable user approval.

## Planned adapter approach

- Windows: native Windows APIs behind a platform adapter.
- Linux GNOME and KDE: XDG Desktop Portal and PipeWire for supported Wayland workflows; X11-specific support where available.
- Keep the core protocol and permission model independent of desktop environment.
