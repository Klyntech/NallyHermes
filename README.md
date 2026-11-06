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

The Python service is an internal HTTP service. It binds to `127.0.0.1:9621`, requires a bearer token, and assigns a separate LightRAG workspace to each Telegram user.

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

The TypeScript client is in `src/agent/lightRag.ts`. Existing Neon memory records remain the source of truth; LightRAG is being added as a retrieval/index layer.

## Getting started

1. Install Node.js 20 or newer.
2. Install dependencies: `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `TELEGRAM_BOT_TOKEN`, `WEBHOOK_URL`, `WEBHOOK_SECRET`, `NVIDIA_NIM_API_KEY`, `DATABASE_URL`, and `TAVILY_API_KEY`.
5. Start the server: `npm run dev`.

## Webhook deployment

Deploy NallyHermes as a **Render Web Service**. Set `WEBHOOK_URL` to the service's public HTTPS URL and `WEBHOOK_SECRET` to a random secret of at least 32 characters (letters, numbers, underscores, or hyphens). Render supplies `PORT` automatically.

The app registers its Telegram webhook on startup and validates Telegram's webhook secret-token header. A health endpoint is available at `/health`.

## Database setup

NallyHermes automatically creates its required Neon tables and indexes at startup using idempotent SQL. No manual migration command is required. Existing rows are preserved.

## Web search

Get an API key from [Tavily](https://tavily.com/) and set it as `TAVILY_API_KEY`.
