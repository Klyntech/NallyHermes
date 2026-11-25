# Service branch: NallyDeskDear

**Product:** NallyDeskDear  
**Role:** C++ desktop device agent  
**Control plane:** NallyHermes + Device System  
**Initial platforms:** Windows, Ubuntu GNOME, KDE Plasma

## Architecture

- C++20 core: device identity, lifecycle, capability checks, and protocol types.
- Platform adapters: Windows APIs; Linux desktop integration through XDG Desktop Portal / PipeWire, with GNOME and KDE coverage.
- Control plane client: authenticated outbound connection, pairing, heartbeat, and task routing (not yet implemented).

## Current milestone

The branch now contains a CMake-based C++20 executable, persistent local device ID, deny-by-default capability set, and Linux desktop-session detection for GNOME/KDE and Wayland/X11. Pairing and remote-control transports remain intentionally unimplemented until the NallyHermes device protocol and account-authentication endpoints are integrated.

## Required security properties

- Account login alone does not authorize desktop control.
- Device pairing requires explicit local user approval.
- Permissions are granular, session-scoped, visible, and revocable.
- No remote command execution, screen capture, or input control without explicit authorization.
- Device identity is not a bearer credential or proof of identity.
