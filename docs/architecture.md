# Architecture

## Design

Nally uses a custom TypeScript orchestration layer. The model interprets user intent and proposes plans or tool calls; deterministic application code validates and executes them.

## Request lifecycle

1. **Telegram adapter** receives a webhook update and creates or retrieves the participant's conversation history.
2. **Context manager** combines the system prompt, trusted clock snapshot, recent conversation and current message.
3. **Planner** asks whether the task benefits from decomposition. Simple requests use the direct model/tool loop.
4. **Plan validator** validates step IDs, dependencies, limits and acyclic ordering.
5. **Execution controller** runs dependency-ready steps within configured time and tool-round budgets.
6. **Tool executor** validates strict schemas, enforces read-only concurrency and runs mutations sequentially.
7. **Evaluator and recovery** distinguish completed, partial and failed work; retry only eligible transient read-only failures and revise bounded read-only work.
8. **Response synthesis** reports verified evidence and outstanding limitations.
9. **Telegram presentation** converts supported Markdown to Telegram HTML, splits long messages and edits the existing progress message.

## Five-tool boundary

The model sees exactly five tools:

- `web_search`
- `fetch`
- `file_io`
- `memory`
- `schedule`

Telegram progress events and internal service endpoints are implementation details, not additional agent tools.

## Data ownership

- **Users:** Telegram identity and saved timezone in Neon.
- **Conversation history:** bounded in-memory cache, separated by chat and participant; not durable.
- **Files:** local per-user workspace. Durable storage requires a persistent mounted volume.
- **Memories:** structured Neon records are authoritative; LightRAG provides semantic and graph retrieval.
- **Schedules:** Neon records with UTC run instants and an IANA timezone for recurring wall-clock behavior.

## LightRAG service

The Python FastAPI process is an optional sidecar. When enabled, it binds to `127.0.0.1:9621`, authenticates requests with a bearer token and maps each Telegram user to a separate LightRAG workspace. Neon PostgreSQL stores the LightRAG data.

## Execution safety

- Strict runtime schemas reject malformed or unknown tool arguments.
- Read-only calls may execute concurrently within configured limits.
- Mutations are sequential and are not automatically replayed.
- Network and model execution use timeouts and bounded retries.
- Retrieved content is untrusted data and cannot change system instructions.
- User-scoped data must never cross participant boundaries.
