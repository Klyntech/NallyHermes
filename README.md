# NallyHermes

**A Telegram-first AI agent with its own orchestration engine.**

Nally combines a natural conversational interface with model-led planning, controlled tool execution, long-term memory and proactive scheduling. It is built around a custom TypeScript agent orchestra rather than a third-party agent framework.

> **Release status: v2 consolidated** — The V2 feature scope is complete on the `Manus-Work-NallyHermes-v2` branch. Voice remains intentionally deferred to a later release.

## What Nally does

- **Talks naturally.** Direct, context-aware conversation without a rigid assistant response template.
- **Plans complex work.** Decides when a task needs a plan, decomposes it into validated steps and tracks dependencies.
- **Uses tools deliberately.** Selects the smallest useful set of tools, runs independent read-only work concurrently and keeps mutations sequential.
- **Recovers intelligently.** Handles transient failures, adapts failed read-only work and reports partial results honestly.
- **Remembers relevant context.** Chooses when to recall user-scoped memories instead of loading memory on every message.
- **Understands time.** Uses a trusted clock snapshot and each user's IANA timezone for relative dates and reminders.
- **Keeps users informed.** Edits one Telegram progress message as work advances, then replaces it with the final response.
- **Works per user.** Separates each Telegram user's memories, schedules and file workspace.

## Capabilities

| Area | Capability |
| --- | --- |
| Conversation | Natural language chat with bounded in-memory conversation history |
| Research | Tavily web search and targeted public-page retrieval |
| Workspace | Read, write, edit, search, list, create folders and delete files |
| Memory | Structured Neon records with LightRAG semantic and graph retrieval |
| Scheduling | One-time and recurring reminders delivered proactively in Telegram |
| Reminder language | Due reminders are phrased naturally by Nally, with a concise fallback if the model is unavailable |
| Workflows | Durable recurring multi-step runs with tool allowlists, approval policy, retries and run history |
| Connectors | Provider-neutral service boundary with explicit Calendar operations and fail-closed permissions |
| Presentation | [NallyHermes V2 Strategy and Architecture Deck](./NallyHermes_V2_—_Personal_AI_Operating_System.pdf) |
| Orchestration | Smart planning, dependencies, parallel read-only execution and recovery |
| Time awareness | IANA timezone support and relative-date interpretation |
| Telegram UX | Live progress editing, Markdown-to-HTML presentation and long-message splitting |

## Architecture

Nally uses a model for interpretation and planning, with deterministic application code controlling permissions, validation, execution limits and tool dispatch.

```mermaid
flowchart TD
    U[Telegram user] --> T[Telegram webhook]
    T --> C[Orchestra controller]
    C --> P[Planner]
    P --> X[Execution engine]
    X --> V[Evaluator and recovery]
    V --> R[Response synthesis]
    R --> T
    X --> W[Five-tool registry]
    W --> S[Search and fetch]
    W --> F[User file workspace]
    W --> M[Neon memory + LightRAG]
    W --> J[Neon schedules]
    C --> CTX[Context manager + trusted clock]
    CTX --> C
    T --> PG[Neon PostgreSQL]
```

### Runtime stack

- **TypeScript / Node.js 20+** — main application and orchestration runtime
- **grammY** — Telegram Bot API and webhook integration
- **NVIDIA NIM** — agent LLM, embeddings and reranking
- **Neon PostgreSQL** — users, memories, schedules and LightRAG storage
- **Drizzle ORM** — application database access
- **LightRAG / FastAPI** — semantic and graph-based long-term memory
- **Tavily** — web search
- **Zod** — runtime configuration and tool argument validation

### Agent tools

Nally intentionally exposes five agent tools:

| Tool | Operations |
| --- | --- |
| `web_search` | Discover current information and public sources |
| `fetch` | Read a specific public HTTP(S) text resource |
| `file_io` | `read`, `write`, `edit`, `grep`, `delete`, `list`, `mkdir` |
| `memory` | `recall`, `remember`, `update`, `forget` |
| `schedule` | `create`, `list`, `cancel` |

The executor validates arguments against strict schemas. Only read-only calls may run concurrently. Mutations execute sequentially and are never automatically replayed after an ambiguous failure.

## Repository layout

```text
.
├── memory-service/       # Internal LightRAG FastAPI service
├── src/
│   ├── agent/            # Orchestra, planning, context, tools and memory
│   ├── db/               # Neon schema and startup setup
│   ├── telegram/         # Telegram message presentation
│   ├── config.ts         # Validated environment configuration
│   └── index.ts          # Bot, webhook and HTTP health endpoint
├── tests/                # Automated regression tests
├── docs/                 # Architecture and operations guides
├── .github/              # CI and dependency automation
├── Dockerfile
└── start.sh
```

## Requirements

- Node.js 20 or newer
- A Telegram bot token
- NVIDIA NIM API access and a compatible chat model
- Neon PostgreSQL
- Tavily API key for web search
- Python 3.11+ and the dependencies in `memory-service/requirements.txt` when running LightRAG locally

## Run locally

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Configure the required Telegram, NVIDIA and Neon values. Set `WEBHOOK_URL` to a public HTTPS URL that can receive Telegram webhooks. For local development, use a secure tunnel to your local server.

4. Start the Node application:

   ```bash
   npm run dev
   ```

LightRAG is disabled by default. To enable it locally, configure the LightRAG variables, start the Python service on `127.0.0.1:9621`, and set `LIGHTRAG_ENABLED=true`.

## V2 proactive workflows

Workflows are opt-in recurring responsibilities, distinct from one-off reminders. Each workflow stores its trigger, bounded instructions, allowed tools, approval policy, Telegram output destination, retry policy and execution history. For example, a user can ask Nally to run every Monday at 8:00 AM to review open project tasks, summarize overdue items, search for relevant updates and send a concise report to Telegram.

The initial V2 worker supports daily, weekly and monthly schedules and records completed or failed runs. It enforces the configured tool allowlist at the orchestra boundary. Daily briefing is implemented as a workflow pattern rather than an always-on feature, combining only configured sources such as pending reminders, saved context and permitted web updates. Calendar data and project task entities will be added through later V2 connectors; Nally must not imply those sources are available until configured.

### Calendar and service mesh

V2 includes a provider-neutral connector layer for Calendar, GitHub, email, and task systems. 

- **Google Calendar Adapter:** The first available adapter uses Google OAuth with a per-Telegram-user allowlist.
- **Conflict Prevention:** Nally checks for overlapping calendar events before saving a reminder. If a conflict is found, it requires confirmation rather than silently scheduling.
- **Fail-closed:** If Calendar is not enabled or the user is not in the `GOOGLE_CALENDAR_TELEGRAM_IDS` allowlist, no external action is taken.

### GitHub tool architecture

GitHub is being built as one dispatcher tool named `github`, not as 46 permanently exposed tools. Nally can discover the compact operation catalog, inspect one operation schema, and then call that operation on demand. This keeps unrelated GitHub schemas out of every model turn. The connector authenticates with a GitHub Personal Access Token supplied only through `GITHUB_TOKEN`; it never accepts a PAT from chat or the web ingestion form.

GitHub access is open to all repositories by default through `GITHUB_ALLOW_ALL_REPOS=true`; `GITHUB_ALLOWED_REPOS` remains available when a deployment needs a restrictive mode. The dispatcher catalog covers repositories, issues, pull requests, files, commits, branches, tags, releases, Actions, checks, deployments, collaborators, users, organizations, gists, comments, reviews, and common approved writes. Delete operations are intentionally absent and rejected by policy. Writes require both `GITHUB_ALLOW_WRITES=true` and an explicit approval field, and mutations are never replayed automatically.

### Conversation and reminder safeguards

V2 now anchors short follow-ups such as `Confirm time`, `Yes`, `Update me`, and `Cancel it` to the active conversation topic instead of treating them as unrelated requests. Nally also distinguishes known clock-time reminders from event-triggered requests such as “when the match starts” and “keep checking”; it must not silently convert uncertain event times into fixed reminders. Reminder delivery strips internal orchestration phrases before composing user-facing language. Full condition-monitoring workflows for live sports and other changing web conditions remain the next implementation milestone.

Nally's conversational voice is intentionally concise and context-aware. It does not volunteer AI-training explanations or capability lists, and it acknowledges ordinary reactions naturally before offering help. Technical identity and limitation details are given briefly only when asked directly.

See the [V2 final report](./V2_FINAL_REPORT.md) for the consolidated feature, security, configuration, and validation summary.

### Hand-built orchestra

NallyHermes does not use an agent-orchestration framework. V2 now includes the next layer of the custom orchestra: deterministic request routing, first-class execution state, phase latency summaries, typed tool-failure categories, condition-monitoring state transitions, and voice-ready request/response boundaries. The router skips smart planning for ordinary conversation, follow-ups, and single actions, while retaining bounded planning for multi-step and monitoring requests. Each execution emits a structured `orchestra.execution` summary for later latency analysis.

### Academic Companion Telegram ingestion

Academic ingestion is Telegram-native. Send Nally a PDF as a document, optionally captioned `Course: Tort | Title: Negligence lecture 3`. Nally stores it in the user’s isolated workspace, extracts text with `pdftotext` when available, and records the source metadata in Neon. `/ingest` explains the format in Telegram.

The academic profile, timetable, and assessment records remain durable Neon data and can be populated through Nally’s normal Telegram conversation and future academic commands. A failed extraction is recorded as a failed extraction rather than presented as searchable content.

The current ingestion layer stores source metadata and extracted text for the next grounded-study milestone: document retrieval with page/source citations, case briefs, statute explanations, IRAC work, and timetable-aware daily briefings.

### Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the TypeScript application in watch mode |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm test` | Run automated regression tests |
| `npm run test:integration` | Run the opt-in Neon integration test when `NALLY_DATABASE_INTEGRATION_URL` is configured |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm run check` | Run typecheck, tests and production build |
| `npm start` | Run the compiled application |

## Configuration

See [`.env.example`](.env.example) for the complete template.

| Variable | Required | Description |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token |
| `WEBHOOK_URL` | Yes | Public HTTPS base URL of the deployed service |
| `WEBHOOK_SECRET` | Yes | Telegram webhook secret; at least 32 allowed characters |
| `NVIDIA_NIM_API_KEY` | Yes | NVIDIA NIM API key |
| `NVIDIA_NIM_BASE_URL` | No | Defaults to NVIDIA's integrate endpoint |
| `NVIDIA_NIM_MODEL` | No | Agent chat model |
| `DATABASE_URL` | Yes | Neon PostgreSQL connection URL |
| `TAVILY_API_KEY` | For search | Enables the `web_search` tool |
| `DEFAULT_TIMEZONE` | No | Default IANA timezone; defaults to `Africa/Lagos` |
| `PORT` | No | HTTP port; defaults to `3000` |
| `FILE_WORKSPACE` | No | Workspace root; defaults to `./workspace` |
| `LIGHTRAG_ENABLED` | No | Enables the internal LightRAG sidecar; defaults to `false` |
| `LIGHTRAG_API_TOKEN` | If enabled | Internal service bearer token; at least 32 characters |
| `LIGHTRAG_LLM_MODEL` | If enabled | NVIDIA-compatible model used by LightRAG |
| `LIGHTRAG_URL` | No | Defaults to `http://127.0.0.1:9621` |
| `LIGHTRAG_EMBEDDING_MODEL` | If enabled | Defaults to `nvidia/nemotron-3-embed-1b` |
| `LIGHTRAG_EMBEDDING_DIM` | If enabled | Defaults to `2048`; must match the model output |
| `LIGHTRAG_WORKING_DIR` | No | Defaults to `./lightrag_data` |
| `GITHUB_TOKEN` | For GitHub | GitHub Personal Access Token stored only in the deployment environment |
| `GITHUB_ALLOW_ALL_REPOS` | No | Defaults to `true`; set `false` to enforce `GITHUB_ALLOWED_REPOS` |
| `GITHUB_ALLOWED_REPOS` | Restrictive GitHub mode | Comma-separated `owner/repo` allowlist |
| `GITHUB_ALLOW_WRITES` | No | Enables the separate write gate; defaults to `false` in production secrets; delete remains denied |
| `GITHUB_TIMEOUT_MS` | No | GitHub request timeout; defaults to 30 seconds |
| `INGESTION_MAX_UPLOAD_BYTES` | No | Telegram PDF ingestion limit; defaults to 10 MB |
| `AGENT_*` | No | Bounded planning, tool, retry, parallelism and timeout budgets; individual model calls default to 120 seconds |
| `NODE_ENV` | No | Runtime environment |
| `LOG_LEVEL` | No | Logging configuration |

When LightRAG is enabled, its Python service requires the same `DATABASE_URL` and `NVIDIA_NIM_API_KEY` plus its own API token and LLM model. Keep its port private; do not expose it publicly.

## Deploy on Render

Deploy as a **Render Web Service** using the repository's `Dockerfile`.

1. Connect the GitHub repository.
2. Select Docker as the runtime.
3. Add the required environment variables from the configuration table.
4. Set `LIGHTRAG_ENABLED=true` only after the LightRAG model, token, embedding model and dimension are configured.
5. Keep `LIGHTRAG_URL` at `http://127.0.0.1:9621`; the sidecar binds to localhost inside the container.
6. Set `WEBHOOK_URL` to the public Render service URL.
7. Confirm the deployment is healthy and test the bot in Telegram.

The container starts the LightRAG sidecar only when `LIGHTRAG_ENABLED=true`. The Node application listens on Render's `PORT`. The public health endpoint is `GET /health`; the LightRAG health endpoint is internal only.

### Persistent files

The default workspace is inside the application directory. Container filesystems may be ephemeral across deploys or restarts. If users need durable files, attach a persistent disk and set `FILE_WORKSPACE` to a directory on that disk. Neon-backed memories and schedules are stored in PostgreSQL.

## Telegram commands

| Command | Description |
| --- | --- |
| `/start` | Start Nally |
| `/help` | Show available capabilities |
| `/timezone` | View the saved timezone |
| `/timezone Africa/Lagos` | Change the saved timezone |
| `/memorycheck` | Run an isolated LightRAG write/read/delete diagnostic |
| `/rerankbench` | Run the NVIDIA reranker diagnostic benchmark |
| `/ingest` | Explain how to send an academic PDF to Nally |

The memory diagnostic uses a temporary tagged document and removes it after the check. It does not intentionally modify saved memories.

## Memory design

Neon is the source of truth for structured memory records. LightRAG adds semantic and relational retrieval over user-specific workspaces.

Memory is not loaded automatically on every message. Nally decides whether recalling prior context would materially improve the current task, issues a focused recall query when useful, and stops once enough relevant information is available. If LightRAG is unavailable, structured Neon recall remains available.

## Privacy and security

- Every user's memories and schedules are scoped to their Telegram identity.
- Conversation history is persisted in Neon, scoped by Telegram user and chat, with a bounded in-memory cache used as a hot-path fallback.
- File paths are restricted to the user's workspace; symbolic-link escapes are rejected.
- The LightRAG API binds to localhost and requires bearer authentication.
- Telegram webhook requests are checked using the configured secret-token header.
- Retrieved web pages and files are treated as untrusted content, not instructions.
- Never commit `.env`, bot tokens, API keys, database URLs or service secrets.

See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance.

## Operational notes

- The database schema is initialized with idempotent SQL at application startup. Existing rows are preserved.
- The schedule worker checks due jobs every 15 seconds and delivers reminders through Telegram.
- Planned execution has configurable limits for step count, tool rounds, parallel work, read retries and elapsed time.
- The application exposes `GET /health` for platform health checks. It is a process health endpoint, not a full dependency-readiness report.
- Render logs are the primary source for deployment and runtime diagnostics.

## Known beta limitations

- V2 durable conversations currently persist the user/assistant transcript; summaries and explicit conversation-management commands are planned next.
- File durability depends on mounting persistent storage and setting `FILE_WORKSPACE`.
- V2 now includes a committed npm lockfile for reproducible dependency installation.
- Automated tests currently cover Telegram presentation behavior; broader orchestration, memory and scheduling integration tests remain to be added.
- A production release should include a selected open-source license and a completed dependency security review.

## Project documentation

- [Architecture](docs/architecture.md)
- [Operations and deployment](docs/operations.md)
- [v1 release checklist](docs/release-checklist.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

Changes to the five-tool interface, memory boundaries, scheduling behavior or orchestration limits should include tests and documentation.

## License

No license has been selected for this repository yet. Until a license is added, do not assume that public visibility grants permission to reuse or redistribute the code.
