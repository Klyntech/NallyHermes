# NallyHermes

A general-purpose AI agent for Telegram, powered by NVIDIA NIM, Neon PostgreSQL and Tavily.

## Stack

- **TypeScript / Node.js** — application runtime
- **grammY** — Telegram bot interface and webhook handling
- **NVIDIA NIM** — LLM and embedding inference through OpenAI-compatible APIs
- **Neon** — serverless PostgreSQL
- **Drizzle ORM** — application database queries and schema
- **LightRAG (Python / FastAPI)** — graph and vector retrieval for long-term memory
- **Tavily** — web search
- **Zod** — runtime validation

## Agent tools

- `web_search` — Tavily-powered web search
- `fetch` — retrieve text from public HTTP(S) URLs
- `file_io` — read, write, edit, grep, delete, list and create directories in each user's isolated workspace
- `memory` — recall, remember, update and forget user-scoped memories in Neon
- `schedule` — create, list and cancel one-time reminders, delivered by the bot

## Clock and timezone awareness

Every agent request receives a trusted clock snapshot generated from the server clock and rendered in the Telegram user's saved IANA timezone. New users default to `Africa/Lagos` (configurable with `DEFAULT_TIMEZONE`). Users can view or change this with `/timezone` and `/timezone Europe/London`. Relative dates are interpreted against that local clock. Reminders store UTC instants and retain the selected timezone so recurring reminders preserve local wall-clock time across daylight-saving changes. One-time schedule timestamps must include an explicit `Z` or numeric UTC offset.

Web search results include the retrieval timestamp and, when Tavily supplies it, the source publication date and an age indicator. Retrieval time is not publication time; undated or older sources must not be presented as verified current information.

## LightRAG memory service

The Python service is an internal HTTP service. It binds to `127.0.0.1:9621`, requires a bearer token, and assigns a separate LightRAG workspace to each Telegram user. It uses `PGTableGraphStorage` rather than Apache AGE, so the graph can run on Neon PostgreSQL without the AGE extension; vectors use Neon’s pgvector support.

Install its dependencies with:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r memory-service/requirements.txt
```

Configure `DATABASE_URL`, `NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_BASE_URL`, `LIGHTRAG_API_TOKEN`, `LIGHTRAG_LLM_MODEL`, `LIGHTRAG_EMBEDDING_MODEL`, and `LIGHTRAG_EMBEDDING_DIM`. The default embedding model is `nvidia/nemotron-3-embed-1b` with 2048 dimensions. The selected NIM embedding model must support the OpenAI-compatible embeddings endpoint and return vectors matching the configured dimension.

Start the service locally with:

```bash
.venv/bin/uvicorn app:app --app-dir memory-service --host 127.0.0.1 --port 9621
```

Set `LIGHTRAG_ENABLED=true` and `LIGHTRAG_URL=http://127.0.0.1:9621` in the Node.js process only after the Python service is running. Keep the LightRAG API token private. Do not expose port 9621 publicly.

Run `/memorycheck` in Telegram to execute an isolated diagnostic: it initializes the caller's LightRAG workspace, inserts a uniquely tagged temporary document, checks naive vector retrieval, deletes only that temporary document, and verifies it no longer appears. It does not modify saved memories. This also tests the no-HNSW retrieval path. The TypeScript client is in `src/agent/lightRag.ts`. Neon remains the source of truth for memory records. On a user's first request after startup, existing Neon memories are indexed into that user's isolated LightRAG workspace before semantic retrieval. New memories are indexed when saved; updates and forget operations are synchronized with the index.

## Context and memory intelligence

Memory retrieval is model-directed for each task. Request preparation does not automatically load stored memories: Nally decides whether prior personal or project context would materially improve the current task, then calls the memory tool with a focused query only when needed. The recall result separates structured Neon records from LightRAG semantic context and reports whether semantic retrieval was available. Nally should apply only relevant records, prefer current conversation instructions over conflicting older memories, refine a recall query only for a specific unresolved gap, and stop once sufficient context is available. Greetings, general knowledge, simple calculations, and unrelated tasks should not trigger memory retrieval.

Neon remains the source of truth for durable memory records; LightRAG provides semantic and relational retrieval. Recall is read-only. Memory writes remain explicit tool operations and follow consent and confirmation rules. If LightRAG is unavailable, structured Neon memories remain available and ordinary task execution continues.

## Agent orchestration

The agent uses a model-led smart planner with deterministic execution controls. A planning pass decides whether a request benefits from decomposition; simple requests fall through to the normal tool loop. Complex requests are split into up to ten validated steps with explicit dependencies.

The controller executes dependency-ready steps, tracks their states, and skips steps whose prerequisites failed. It preserves successful and partial tool observations and always attempts a final evidence-based report, even when execution stops early; the report distinguishes verified findings, partial work, and incomplete steps without inventing results. The agent continually evaluates information sufficiency: it reuses existing results, gathers only what is needed, and stops researching once the evidence answers the request. It avoids redundant searches, fetches, and verification. When a tool fails, the model is instructed to diagnose the error and adapt its approach; transient failures may be retried with bounded exponential backoff for read-only calls only. Mutations are never automatically replayed. For at most two failed read-only plan steps, the controller makes one bounded recovery pass that asks the model to revise its approach using prior evidence; dependent steps already skipped remain clearly marked incomplete. Independent steps may run concurrently only when the planner marks them read-only; the executor independently checks every tool call before allowing concurrency. Tool arguments are validated against strict Zod schemas before dispatch, and invalid calls return structured tool errors. Mutating operations run sequentially. Defaults allow up to 10 plan steps, 60 tool rounds per planned request, 15 tool rounds per step, five parallel read-only plan steps, five parallel read-only tool calls per batch, two retries for transient read-only failures, and an eight-minute planned-execution deadline. These limits are configurable through the `AGENT_*` environment variables and bounded by configuration validation. The normal direct tool loop defaults to 12 model rounds. Malformed plans safely fall back to direct execution.

The five agent tools remain unchanged: `web_search`, `fetch`, `file_io`, `memory`, and `schedule`. Tool selection guidance distinguishes broad discovery from targeted fetching and read-only operations from mutations. Telegram progress edits reflect planning and actual tool/step execution states.

## Getting started

1. Install Node.js 20 or newer.
2. Install dependencies: `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `TELEGRAM_BOT_TOKEN`, `WEBHOOK_URL`, `WEBHOOK_SECRET`, `NVIDIA_NIM_API_KEY`, `DATABASE_URL`, and `TAVILY_API_KEY`.
5. Start the server: `npm run dev`.

## Render deployment

Deploy NallyHermes as a **Render Web Service** using the repository's `Dockerfile`. The container runs the Node.js Telegram agent and the Python LightRAG service together. Render supplies the public `PORT`; LightRAG remains private on `127.0.0.1:9621`.

Set these environment variables in Render:

- `TELEGRAM_BOT_TOKEN`
- `WEBHOOK_URL` — the public HTTPS URL of the Render service
- `WEBHOOK_SECRET` — at least 32 characters
- `NVIDIA_NIM_API_KEY`
- `NVIDIA_NIM_BASE_URL`
- `NVIDIA_NIM_MODEL`
- `DATABASE_URL` — Neon PostgreSQL connection string
- `TAVILY_API_KEY`
- `LIGHTRAG_ENABLED=true`
- `LIGHTRAG_API_TOKEN` — generate a separate random secret of at least 32 characters
- `LIGHTRAG_LLM_MODEL`
- `LIGHTRAG_EMBEDDING_MODEL=nvidia/nemotron-3-embed-1b`
- `LIGHTRAG_EMBEDDING_DIM=2048`

Keep `LIGHTRAG_URL` at its default `http://127.0.0.1:9621`. Do not expose port 9621 publicly. Confirm that the selected NVIDIA NIM embedding model is enabled for your API key and that its output dimension matches `LIGHTRAG_EMBEDDING_DIM`.

The app registers its Telegram webhook on startup and validates Telegram's webhook secret-token header. The public health endpoint is `/health`; the internal LightRAG health endpoint is bound to localhost only.

## Database setup

NallyHermes automatically creates its required Neon tables and indexes at startup using idempotent SQL. No manual migration command is required. Existing rows are preserved.

## Web search

Get an API key from [Tavily](https://tavily.com/) and set it as `TAVILY_API_KEY`.
