# NallyDeskDear

Desktop device agent for Nally — **full computer use under approval**.

## Role

Runs on the user’s laptop. Pairs to NallyHermes, heartbeats, pulls approved jobs, executes operable capabilities, returns results.

## v1 target capabilities

1. `health`
2. `list_workspace` / `read_workspace` / `write_workspace`
3. `run_command` (workspace-scoped terminal)
4. `open_app`
5. Later: `screenshot`, `ui_drive`

## Runtime (v0)

- **Python 3.11+** agent (fast to ship; matches “companion-style” simplicity)
- Config: `~/.nally/deskdear.toml` — server URL, device token, workspace path
- Workspace default: `~/NallyWorkspace`

## CLI sketch

```bash
python -m deskdear pair --code a1b2c3 --server https://nally.example
python -m deskdear run          # heartbeat loop + job worker
python -m deskdear status
```

## Safety

- No jobs without cloud **approved** status
- Commands default to workspace cwd
- Optional command allowlist in config
- User can revoke device from Telegram anytime

## Layout

```
products/nally-deskdear/
  README.md
  pyproject.toml          # next
  src/deskdear/           # next
```
