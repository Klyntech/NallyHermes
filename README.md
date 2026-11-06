# NallyHermes

A general-purpose AI agent for Telegram, powered by NVIDIA NIM and Neon PostgreSQL.

## Stack

- **TypeScript / Node.js** — application runtime
- **grammY** — Telegram bot interface
- **NVIDIA NIM** — LLM inference through its OpenAI-compatible API
- **Neon** — serverless PostgreSQL
- **Drizzle ORM** — database schema and queries
- **Zod** — runtime validation for configuration and tools

## Core tools

The initial tool surface is intentionally limited to:

- `web_search`
- `fetch`
- `file_io` — `read`, `write`, `edit`, `grep`, `delete`, `list`, `mkdir`
- `memory` — `recall`, `remember`, `forget`, `update`
- `schedule`

Tools are registered through the custom tool registry. Tool execution must validate inputs and enforce permissions before performing side effects.

## Getting started

1. Install Node.js 20 or newer.
2. Install dependencies: `npm install`.
3. Copy `.env.example` to `.env` and provide the Telegram token, NVIDIA NIM API key, and Neon connection string.
4. Create the database tables using the schema in `src/db/schema.ts` (migration generation will be added next).
5. Start the bot: `npm run dev`.

## Current status

The initial foundation connects Telegram messages to NVIDIA NIM. Database schema and the custom tool registry are scaffolded; persistence and the five native tool implementations are the next development milestone.
