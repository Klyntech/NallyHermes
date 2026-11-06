# NallyHermes

A general-purpose AI agent for Telegram, powered by NVIDIA NIM, Neon PostgreSQL and Tavily.

## Stack

- **TypeScript / Node.js** — application runtime
- **grammY** — Telegram bot interface and webhook handling
- **NVIDIA NIM** — LLM inference through its OpenAI-compatible API
- **Neon** — serverless PostgreSQL
- **Drizzle ORM** — database queries and schema
- **Tavily** — web search
- **Zod** — runtime validation

## Agent tools

- `web_search` — Tavily-powered web search
- `fetch` — retrieve text from public HTTP(S) URLs
- `file_io` — read, write, edit, grep, delete, list and create directories in each user's isolated workspace
- `memory` — recall, remember, update and forget user-scoped memories in Neon
- `schedule` — create, list and cancel one-time reminders, delivered by the bot

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
