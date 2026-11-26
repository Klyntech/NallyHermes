# DeskDear headless simulator security test report

## Scope

This campaign tests the headless execution boundary before any connection to NallyHermes. It treats every operation as hostile input and checks both authorization behavior and filesystem containment.

The tested behaviors include health execution, workspace write/read, missing local approval, unauthenticated sessions, revoked sessions, expired sessions, expired operation deadlines, malformed or unknown actions, parent traversal, absolute paths, oversized payloads, and symlink redirection outside the configured workspace.

## Result

The first run exposed a real sandbox escape. Lexical path validation rejected `..` and absolute paths, but it did not reject a path such as `linked/secret.txt` when `linked` was a symlink to a directory outside the workspace. A write through that symlink could have modified a file outside the configured root, and a read could have disclosed outside data.

The simulator now creates or verifies the workspace root and resolves both the root and requested path with `weakly_canonical`. It rejects any resolved path that is outside the canonical workspace root. The symlink read and write attack cases now fail as expected.

## Passing checks

The strict simulator security test passes with C++20, `-Wall`, `-Wextra`, `-Wpedantic`, and `-Werror`. The existing permission and session-policy tests also pass.

The current simulator therefore fails closed for the tested cases:

- No authentication.
- Revoked or expired session.
- Operation deadline outside the active session.
- Capability not granted.
- Missing local approval.
- Empty or malformed operation identity.
- Unknown simulator operation.
- Absolute paths.
- Lexical parent traversal.
- Symlink-based escape from the workspace.
- Payloads larger than 1 MiB.

## Remaining risks before a real agent

This is still a local simulator and has no authenticated transport, device key, pairing flow, remote revocation channel, user interface, audit sink, or real desktop adapter. The filesystem check should be re-evaluated for the final platform adapter because concurrent filesystem mutation can create time-of-check/time-of-use concerns. Production adapters should use platform-specific safe-open primitives where available, avoid following untrusted symlinks, and enforce workspace policy at the file-descriptor level.

Screen capture, keyboard/mouse input, arbitrary command execution, application launching, credentials, and browser control remain intentionally unimplemented and should not be enabled by simply adding new action strings.
