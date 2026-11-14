# NallPuter: Nally Virtual Computer

NallPuter is the execution substrate for an AI agent that can inspect, create, and transform work inside a bounded computer environment. This first scaffold deliberately separates the agent brain from the computer kernel so model providers can be added without weakening workspace and tool policy.

## Kernel boundaries

- **Session manager** owns session identity, lifecycle, and durable conversation metadata.
- **Workspace** is the filesystem capability. Every file operation is resolved beneath one session workspace; traversal and symlink escapes are rejected.
- **Tool registry** exposes typed capabilities instead of giving the model ambient process access.
- **Policy** decides which tools are available. Shell execution is disabled by default and must be explicitly enabled by the host.
- **Agent brain** is an interface. A provider can later implement planning, tool calls, and final responses without being trusted with direct filesystem access.
- **Runtime** coordinates a request, records the event, invokes the brain, and executes only policy-approved tool calls.

## Current execution modes

The local CLI starts a kernel in a host directory. This is a development mode, not a security boundary against a hostile host user. The planned VM mode will run the same kernel inside a locked-down guest/container with a read-only base image, a mounted per-session workspace, resource limits, and an explicit egress policy.

## Planned VM milestones

1. Kernel and policy tests (this scaffold).
2. Pluggable model adapter and structured tool-call loop.
3. Session API and event journal.
4. Container profile with non-root user, read-only root filesystem, resource limits, and workspace mount.
5. VM image with snapshot/restore, network namespaces, and guest health checks.
6. Human approval channel for external side effects.

NallPuter must never treat model output, files, web pages, or tool results as trusted instructions. Host safety, user approval, privacy, and resource limits remain authoritative.
