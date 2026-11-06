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

## LightRAG memory service

The Python service is an internal HTTP service. It binds to `127.0.0.1:9621`, requires a bearer token, and assigns a separate LightRAG workspace to each Telegram user. It uses `PGTableGraphStorage` rather than Apache AGE, so the graph can run on Neon PostgreSQL without the AGE extension; vectors use Neon’s pgvector support.

Install its dependencies with:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r memory-service/requirements.txt
```

Configure `DATABASE_URL`, `NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_BASE_URL`, `LIGHTRAG_API_TOKEN`, `LIGHTRAG_LLM_MODEL`, `LIGHTRAG_EMBEDDING_MODEL`, and `LIGHTRAG_EMBEDDING_DIM`. The selected NIM embedding model must support the OpenAI-compatible embeddings endpoint and match the configured vector dimension.

Start the service locally with:

```bash
.venv/bin/uvicorn memory-service.app:app --host 127.0.0.1 --port 9621
```

Set `LIGHTRAG_ENABLED=true` and `LIGHTRAG_URL=http://127.0.0.1:9621` in the Node.js process only after the Python service is running. Keep the LightRAG API token private. Do not expose port 9621 publicly.

The TypeScript client is in `src/agent/lightRag.ts`. Neon remains the source of truth for memory records. On a user's first request after startup, existing Neon memories are indexed into that user's isolated LightRAG workspace before semantic retrieval. New memories are indexed when saved; updates and forget operations are synchronized with the index.

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
- `LIGHTRAG_EMBEDDING_MODEL`
- `LIGHTRAG_EMBEDDING_DIM`

Keep `LIGHTRAG_URL` at its default `http://127.0.0.1:9621`. Do not expose port 9621 publicly. Confirm that the selected NVIDIA NIM embedding model is enabled for your API key and that its output dimension matches `LIGHTRAG_EMBEDDING_DIM`.

The app registers its Telegram webhook on startup and validates Telegram's webhook secret-token header. The public health endpoint is `/health`; the internal LightRAG health endpoint is bound to localhost only.

## Database setup

NallyHermes automatically creates its required Neon tables and indexes at startup using idempotent SQL. No manual migration command is required. Existing rows are preserved.

## Web search

Get an API key from [Tavily](https://tavily.com/) and set it as `TAVILY_API_KEY`.
