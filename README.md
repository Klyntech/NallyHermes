# NallPuter

NallPuter (Nally Virtual Computer) is a secure-by-default computer kernel for AI agents. It provides isolated session workspaces, durable session metadata, policy-gated tools, and a pluggable agent-brain interface.

## Quick start

```bash
npm install
npm test
npm run dev -- --workspace ./workspace
```

The CLI starts a local development kernel. Shell execution is disabled by default:

```bash
NALLPUTER_ENABLE_SHELL=true npm run dev -- --workspace ./workspace
```

Only enable shell execution inside a disposable, trusted development workspace. The local mode is not a VM security boundary; the VM/container profile is a later milestone documented in [docs/nallputer-architecture.md](docs/nallputer-architecture.md).

## Kernel capabilities

- Session creation and durable JSON metadata.
- Workspace-safe list, read, and write operations.
- Optional command execution behind an explicit policy gate, timeout, and output limit.
- Typed `AgentBrain` interface for future model providers.
- JSON-line CLI protocol suitable for a supervisor or VM guest process.

## Development

```bash
npm run build
npm test
```
