# NallPuter guest security checklist

This is a design checklist for the future VM/container profile. The local TypeScript kernel is not a hostile-host security boundary.

- Run as a non-root user with a read-only base filesystem.
- Mount only the active session workspace as writable storage.
- Use a per-session data directory and restrictive file permissions.
- Disable shell by default; enable it only through an explicit host policy.
- Apply CPU, memory, process-count, disk, and wall-clock limits.
- Define network egress as an explicit capability; default to no network.
- Keep secrets outside the guest filesystem and inject short-lived scoped credentials.
- Require human approval for external side effects such as sending, publishing, deleting, or purchasing.
- Record tool calls, results, policy decisions, and resource failures in an append-only event journal.
- Add snapshot/restore and guest health checks before calling the environment a VM.
