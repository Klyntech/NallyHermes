# NallyHermes

A general-purpose AI agent for Telegram, powered by NVIDIA NIM, Neon PostgreSQL and Tavily.

## Stack

- **TypeScript / Node.js** — application runtime
- **grammY** — Telegram bot interface
- **NVIDIA NIM** — LLM inference through its OpenAI-compatible API
- **Neon** — serverless PostgreSQL
- **Drizzle ORM** — database queries and schema
- **Tavily** — web search
- **Zod** — runtime validation

## Current tool

- `web_search` — Tavily-powered web search

## Getting started

1. Install Node.js 20 or newer.
2. Install dependencies: `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `TELEGRAM_BOT_TOKEN`, `NVIDIA_NIM_API_KEY`, `DATABASE_URL`, and `TAVILY_API_KEY`.
5. Start the bot: `npm run dev`.

## Database setup

NallyHermes automatically creates its required Neon tables and indexes at startup using idempotent SQL. No manual migration command is required. Existing rows are preserved.

## Web search

Get an API key from [Tavily](https://tavily.com/) and set it as `TAVILY_API_KEY`.
