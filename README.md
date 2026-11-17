# NallyHermes

**A Telegram-first AI agent with a custom orchestration engine, bounded tools, memory, voice, and proactive workflows.**

Nally interprets requests with an OpenAI-compatible NVIDIA NIM model, while deterministic TypeScript code controls validation, permissions, budgets, persistence, approval, and tool execution. The project deliberately does not depend on a third-party agent-orchestration framework.

> **Current development line: `3.1.0-alpha.1` / branch `v3.1-Emotions`** — The current branch includes adaptive orchestration, academic PDF ingestion, production Telegram voice notes, repository-local skills, hybrid search, the affect layer, live NallPuter connector dispatch, and Telegram inline approval for mutations. This is an alpha development line, not a stable release.

## What Nally does

- Talks naturally through Telegram text, voice notes, and audio messages.
- Chooses between direct conversation, one-tool execution, parallel read-only work, and bounded multi-step plans.
- Uses evidence-backed web search and targeted page fetching instead of guessing current facts.
- Maintains per-user memories, conversations, schedules, academic documents, and isolated workspaces.
- Supports recurring workflows with allowlists, approval policies, retry limits, run history, and Telegram delivery.
- Uses repository-local `SKILL.md` packages with progressive disclosure: the skill catalog is discoverable, while full instructions are loaded only when relevant.
- Adapts tone through a bounded affect layer without narrating internal emotions or changing safety permissions.
- Pauses mutations for Telegram **Deny / Allow / Always Allow** approval before execution.

## Current capabilities

| Area | Current behavior |
| --- | --- |
| Conversation | Telegram webhook chat with durable Neon history scoped by Telegram user and chat, plus a bounded in-memory hot-path cache |
| Research | Hybrid Creepy Crawley + optional Tavily search, source tiering, advanced/research mode, and targeted public-page fetch |
| Workspace | Per-user `read`, `write`, `edit`, `grep`, `delete`, `list`, and `mkdir` operations with traversal and symlink protection |
| Memory | Typed Neon records with optional LightRAG semantic/graph retrieval and selective model-directed recall |
| Scheduling | One-time and daily/weekly/monthly reminders delivered proactively through Telegram |
| Workflows | Durable recurring multi-step runs with tool allowlists, read-only or confirm-mutations policy, retries, and run history |
| Academic | Telegram PDF ingestion, Poppler extraction, metadata enrichment, indexed search, and `list/search/get/delete/rename` operations |
| Voice | Bounded Telegram voice/audio input, FFmpeg normalization, Deepgram STT, ElevenLabs TTS, retries, deduplication, and spoken/text delivery |
| Connectors | Calendar, GitHub, Notion, Gmail, and NallPuter dispatchers with credential gates and mutation approval |
| Telegram UX | Live progress edits, rich-message transport when supported, HTML fallback, message splitting, inline mutation approval, and webhook idempotency |
| Skills | Proven repository-local skill packages selected by relevance and injected progressively into trusted context |
| Accuracy | Source-backed claim rules, primary-source preference, deterministic claim audit, and explicit `Not verified` / `Partial` labels |

## Architecture

```mermaid
flowchart TD
    U[Telegram user] --> W[HTTPS webhook]
    W --> A[Telegram adapter]
    A --> C[Adaptive orchestra/controller]
    C --> CTX[Context manager]
    CTX --> SK[Relevant SKILL.md packages]
    CTX --> H[Neon conversation history]
    C --> P[Direct loop or bounded planner]
    P --> X[Validated executor]
    X --> G[Mutation approval gate]
    G --> T[Tool dispatch]
    T --> S[Search/fetch]
    T --> F[Per-user workspace]
    T --> M[Neon memory + optional LightRAG]
    T --> J[Schedules/workflows]
    T --> K[Calendar/GitHub/Notion/Gmail/NallPuter]
    G --> I[Telegram inline keyboard]
    X --> E[Evaluator/recovery/claim audit]
    E --> R[Spoken + text response]
    R --> A
```

### Runtime stack

- **Node.js 22 / TypeScript** — application and orchestration runtime.
- **grammY** — Telegram Bot API, webhook updates, files, and callback queries.
- **NVIDIA NIM** — agent model, embeddings, and reranking endpoints.
- **Neon PostgreSQL + Drizzle ORM** — users, conversations, memories, academic records, schedules, workflows, and approval state.
- **Neon PostgreSQL full-text search** — native, user-scoped retrieval for saved memories and academic document excerpts; no Python service or remote reranker is in the normal search path.
- **Optional LightRAG / FastAPI sidecar** — retained for explicit diagnostics and reranker benchmarks, not normal memory or library retrieval.
- **Creepy Crawley + optional Tavily** — primary and fallback web search/fetch backends.
- **Deepgram + ElevenLabs** — Telegram speech-to-text and text-to-speech when voice is enabled.
- **FFmpeg / Poppler** — bounded Telegram audio normalization and PDF text extraction.

## Agent tools

The model currently sees twelve function tools:

| Tool | Purpose |
| --- | --- |
| `web_search` | Current-information discovery with basic/advanced depth and research mode |
| `fetch` | Read one public HTTP(S) page after discovery |
| `file_io` | Bounded per-user workspace operations |
| `memory` | Selective recall and consented durable memory changes |
| `schedule` | Reminder list/create/cancel with timezone-aware recurrence |
| `workflow` | Recurring bounded work with allowlists and approval policy |
| `calendar` | Calendar list/create/update/cancel when Google Calendar is configured |
| `github` | Dynamic `list_operations → get_operation → call_operation` dispatcher |
| `notion` | Dynamic Notion dispatcher with bounded reads and approved writes |
| `gmail` | Dynamic Gmail dispatcher with bounded reads, drafts, and approved sends/mutations |
| `nallputer` | Token-authenticated bounded computer-kernel dispatcher |
| `academic` | Indexed academic document list/search/get/delete/rename operations |

The executor validates tool arguments with Zod. Read-only calls may run concurrently within configured limits. Mutations are gated, execute sequentially, are never blindly replayed, and use Telegram inline approval when required.

## Academic PDF ingestion

Academic ingestion is Telegram-native. Send a PDF as a document, optionally with a caption such as:

```text
Course: Tort | Title: Negligence lecture 3
```

The current flow is:

1. Check Telegram’s declared file size and the configured `INGESTION_MAX_UPLOAD_BYTES` limit.
2. Download the document into the user’s isolated `FILE_WORKSPACE/<telegram-id>/academic` directory.
3. Store metadata in Neon.
4. For PDFs, run `pdftotext -layout` with a bounded timeout and temporary output file.
5. Preserve an explicit status rather than presenting failed extraction as searchable content.
6. When extracted text is written to Neon, the database's GIN full-text index updates with the row; no detached indexing request is required.

Document statuses include `stored`, `stored_no_text`, `stored_extraction_failed`, and `indexed`. On startup, legacy extracted/indexing/index-failed rows with extracted text are normalized to `indexed`; no Python-side index rebuild is required. Academic search is isolated to the user's extracted documents and returns excerpts with document title/course provenance; it never searches personal memories. `/ingest` explains the accepted format. Course/title metadata can arrive in the original caption or in a follow-up label message.

## Telegram voice

Voice is disabled by default. When enabled, Nally accepts Telegram voice/audio updates, rejects oversized or overlong input, downloads with a byte limit, normalizes through FFmpeg to mono 16 kHz PCM WAV, transcribes through Deepgram, and returns a bounded spoken response plus an optional text supplement. ElevenLabs output is clipped by `VOICE_TTS_MAX_CHARS`; links, tables, citations, and source detail remain in text. Telegram message IDs are deduplicated so webhook redelivery does not create duplicate voice replies.

See [the Telegram voice production contract](docs/skills/telegram-voice-production.md).

## Skills

Skills live under `skills/*/SKILL.md`. The runtime registry reads metadata, selects strong domain matches, and injects full bodies only for relevant requests. Imported packages retain provenance in [`skills/PROVENANCE.md`](skills/PROVENANCE.md). Skills provide procedures and guidance; they never override system safety, privacy, approval, tool, or budget rules.

## Inline approval flow

Mutation-capable tools pause before execution and persist a `pending_approvals` record. Telegram receives an inline keyboard with **Deny**, **Allow**, and **Always Allow**. Callback queries are acknowledged immediately, ownership is checked against the Telegram user ID, and an atomic claim prevents repeated taps from executing the same mutation twice. `Always Allow` persists a provider/operation scope in `approval_grants`. Approval tables and indexes are created idempotently at startup.

## NallPuter

NallPuter is accessed as a bounded external computer connector, not as an unrestricted shell. The connector is disabled when `NALLPUTER_URL` is unset. Supported live operations include health, workspace listing, file reads, gated file writes, and gated command execution; reserved process/log/test/build operations fail explicitly until the remote VM profile exposes them. Credentials are deployment-only and never accepted from chat.

The VM scaffold itself lives on the separate `NallPuter` branch; its architecture documentation is maintained with that branch rather than duplicated here.

## Repository layout

```text
.
├── src/agent/             # orchestra, tools, skills, affect, voice, approvals
├── src/academic/          # ingestion and academic persistence
├── src/connectors/        # GitHub, Calendar, Notion, Gmail, NallPuter
├── src/db/                # Neon schema and idempotent startup setup
├── src/telegram/          # Telegram presentation and ingestion metadata
├── tests/                 # automated regression tests
├── skills/                # repository-local progressive-disclosure skills
├── docs/                  # architecture, operations, and feature contracts
├── memory-service/        # optional LightRAG diagnostics sidecar
├── Dockerfile             # Node 22 + Poppler + FFmpeg image
└── start.sh               # optional sidecar supervision and Node startup
```

## Requirements and local setup

- Node.js 22 or newer.
- Telegram bot token.
- NVIDIA NIM API access and a compatible model.
- Neon PostgreSQL.
- Creepy Crawley and/or Tavily credentials for web search.
- Poppler and FFmpeg for local non-Docker development.
- Python 3.11+ and `memory-service/requirements.txt` only when running LightRAG locally.

```bash
npm ci
cp .env.example .env
# configure required values in .env
npm run dev
```

Native Postgres full-text search is the default for academic and saved-memory lookup. LightRAG is disabled by default and is no longer required for normal retrieval; enable it only when using `/memorycheck` or `/rerankbench`, after configuring `LIGHTRAG_API_TOKEN`, `LIGHTRAG_LLM_MODEL`, embedding settings, and the local sidecar.

## Commands and validation

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the TypeScript application in watch mode |
| `npm run typecheck` | Type-check source and test configuration |
| `npm test` | Run automated regression tests |
| `npm run test:integration` | Run the opt-in Neon integration test |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm run check` | Run typecheck, tests, and build |
| `npm start` | Run the compiled application |

## Configuration and deployment

The complete environment template is [`.env.example`](.env.example). Required values are `TELEGRAM_BOT_TOKEN`, `WEBHOOK_URL`, `WEBHOOK_SECRET`, `NVIDIA_NIM_API_KEY`, and `DATABASE_URL`. `WEBHOOK_URL` must be public HTTPS and the secret must contain at least 32 permitted characters.

Optional feature groups include LightRAG, Creepy Crawley/Tavily, Google Calendar, GitHub, Notion, Gmail, NallPuter, academic ingestion limits, and voice. Keep connector tokens server-side. Enable provider write flags only when the deployment is prepared to handle inline approval.

Deploy the Dockerfile as a Render Web Service. The image installs Node 22, Poppler, FFmpeg, and the optional LightRAG Python environment. The public `GET /health` endpoint checks process availability only; it is not a full dependency-readiness check. Mount persistent storage and set `FILE_WORKSPACE` if local files must survive container replacement. Neon remains the durable store for structured data.

## Telegram commands

| Command | Description |
| --- | --- |
| `/start` | Start Nally |
| `/help` | Show capabilities |
| `/timezone` | View the saved timezone |
| `/timezone Africa/Lagos` | Change the saved timezone |
| `/memorycheck` | Run an isolated LightRAG memory diagnostic |
| `/rerankbench` | Run the NVIDIA reranker diagnostic |
| `/ingest` | Explain academic PDF ingestion |

## Android app pairing and chat sync

The native Android client connects to `https://nally.onrender.com`. Its primary sign-in uses Telegram's native OIDC Login SDK. Register the Android package and signing-certificate SHA-256 in **@BotFather → Bot Settings → Login Widget**, then configure `TELEGRAM_LOGIN_CLIENT_ID` and `TELEGRAM_LOGIN_REDIRECT_URI` on Render. The Android app requests `profile` and `telegram:bot_access`; the backend verifies Telegram's JWT signature, issuer, audience, expiry, and a short-lived single-use nonce before creating a 30-day opaque session. Only a keyed HMAC of the session token is stored. The account must have started Nally in a private chat at least once so its Telegram user record exists. The login Client ID and redirect URI are public OIDC settings, not bot credentials.

Until Telegram Login is configured, the client offers a fallback: in a **private chat** with Nally, send `/mobile`; enter the returned single-use 10-digit code in the app within five minutes. The code proves access to that Telegram chat and is not a Telegram bot token. The API exchanges it for the same 30-day session type; only a keyed HMAC of the code/session token is stored. Pairing consumes the code through a single atomic database update because Neon HTTP does not support Drizzle transactions. Unlinking the device revokes its session. Pairing codes are never returned by an unauthenticated API response.

The protected `/api/mobile/` API provides pairing, session revocation, message submission, an ordered shared transcript and the current sanitized agent activity. Ordinary text messages sent from Android are mirrored into the linked private Telegram chat with an explicit `From NallyHermes Android` label; their agent replies are likewise labeled. Telegram and Android text turns are persisted in one ordered conversation, with in-progress, approval-required and failed states. Tool operations that require approval still require a Telegram approval button and are not silently authorized by the app. The Android client polls the transcript/activity endpoints over HTTPS; this is a polling integration, not a streaming socket. The live activity snapshot is process-local and can reset if Render restarts during a request. Telegram attachments and native voice capture are not part of this text-sync flow.

## Privacy, safety, and beta limitations

- User memories, conversations, schedules, academic records, files, and approval state are scoped by Telegram identity.
- Web pages, files, connector responses, and NallPuter output are untrusted data, not instructions.
- Workspace paths reject traversal and symlink escapes.
- Mutations require explicit tool/provider gates and Telegram approval where applicable.
- The webhook secret is validated before update processing.
- Never commit `.env`, tokens, API keys, database URLs, or user data.
- Local workspace files are ephemeral without a persistent volume.
- Live provider integration tests require configured services; the default suite is regression-focused.
- No repository license has been selected yet; public visibility does not grant reuse rights.

See [SECURITY.md](SECURITY.md), [docs/architecture.md](docs/architecture.md), [docs/operations.md](docs/operations.md), and [CHANGELOG.md](CHANGELOG.md).
