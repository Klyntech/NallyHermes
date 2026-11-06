# NallyHermes

A general-purpose Telegram AI agent built with TypeScript, NVIDIA NIM and Neon PostgreSQL.

## Stack

- TypeScript / Node.js 20+
- Telegram via grammY
- NVIDIA NIM through its OpenAI-compatible API
- Neon PostgreSQL + Drizzle ORM
- Zod for runtime validation

## Native tools

- `web_search`: Brave Search API. Configure `BRAVE_SEARCH_API_KEY`.
- `fetch`: retrieve readable text from public HTTP(S) pages; local/private network targets are blocked.
- `file_io`: `read`, `write`, `edit`, `grep`, `delete`, `list`, `mkdir`. Each Telegram user has an isolated workspace under `FILE_WORKSPACE`.
- `memory`: `recall`, `remember`, `forget`, `update`. Records are scoped to the Telegram user in Neon.
- `schedule`: create, list, update and cancel one-time reminders. A polling worker sends due reminders to Telegram.

The custom registry validates tool arguments with Zod. NVIDIA NIM tool calls are executed by a bounded orchestration loop (maximum six tool rounds per user request).

## Setup

1. Use Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and configure Telegram, NVIDIA NIM and Neon credentials. Add a Brave Search API key to enable `web_search`.
4. Apply the SQL in `drizzle/0001_initial.sql` to your Neon database.
5. Run `npm run dev`.

## Safety notes

File operations are restricted to a per-user workspace. Web fetch blocks common local/private address ranges and does not follow more than one redirect. Tool inputs are schema-validated and database memory/schedule operations are scoped to the authenticated Telegram user.

For production, deploy behind a process supervisor and add durable conversation history, scheduler retry/recovery, DNS-level SSRF protection, and per-user rate limits.
