# Operations

## Current release line

The current branch is `v3.1-Emotions`, documented as `3.1.0-alpha.1`. Treat it as an alpha deployment. The separate `NallPuter` branch contains the computer-kernel scaffold; this branch consumes NallPuter through its bounded connector API.

## Health and webhook

- Public process health: `GET /health` on the Node service.
- Internal LightRAG health: `GET http://127.0.0.1:9621/health` inside the container, only when LightRAG is enabled.
- Telegram webhook: `WEBHOOK_URL` plus `/telegram/<WEBHOOK_SECRET>`; Telegram’s secret-token header is validated before update dispatch.
- The public health endpoint confirms that the Node HTTP server responds. It does not prove that Neon, NVIDIA, search providers, voice providers, Calendar, GitHub, Gmail, Notion, or LightRAG are reachable.

## Deployment

Use the repository Dockerfile for Render or another container platform. It installs Node 22, `poppler-utils` for PDF extraction, FFmpeg for Telegram voice normalization, and the optional Python LightRAG environment. `start.sh` checks `pdftotext`, starts LightRAG only when `LIGHTRAG_ENABLED=true`, waits for its private health endpoint, and supervises the Node process.

Set the required values in `.env.example`: Telegram, public HTTPS webhook, webhook secret, NVIDIA NIM, and Neon. Keep LightRAG disabled unless its API token, LLM model, embedding model/dimension, and database settings are ready. Keep connector and voice credentials in deployment secrets; never accept them from chat.

For durable user files, attach a persistent disk and set `FILE_WORKSPACE` to its mount path. Neon stores durable structured records, including conversations, memories, academic metadata, schedules, workflows, and approvals.

## Database startup and migrations

`ensureDatabase()` applies idempotent SQL at startup. It creates and indexes the core tables, including `approval_grants` and `pending_approvals`. Existing rows are preserved. If a deployment was started from a commit before inline approvals were added, restart it on a current commit so the startup initializer can create these tables.

Approval state is operationally important: a missing `pending_approvals` table causes mutation gating to fail before Telegram can display a usable approval action. Monitor startup logs for `Neon database schema is ready.` and database errors.

## Academic ingestion

Send a PDF to the bot as a Telegram document. `/ingest` explains the accepted caption format:

```text
Course: Tort | Title: Negligence lecture 3
```

The handler enforces Telegram’s declared size and `INGESTION_MAX_UPLOAD_BYTES`, stores the file beneath the user’s academic workspace, runs bounded `pdftotext -layout`, and records the result in Neon. `stored_no_text` indicates an empty or scanned/image-only PDF; `stored_extraction_failed` includes extraction diagnostics. When LightRAG is enabled, successful extraction is sent to `/v1/academic/insert`; only confirmed indexing becomes `indexed`, while provider failure becomes `extracted_index_failed`.

## Voice operations

Voice is disabled by default. To enable it, set `VOICE_ENABLED=true`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, and `ELEVENLABS_VOICE_ID`. The handler rejects overlong or oversized Telegram audio, downloads with a limit, normalizes with FFmpeg, transcribes with Deepgram, and synthesizes bounded spoken output with ElevenLabs. Provider retries are limited and logged as structured `voice.provider` events. Telegram message IDs are deduplicated against webhook redelivery.

## Inline approval operations

Mutation-capable tools persist a pending row and send a Telegram inline keyboard with Deny, Allow, and Always Allow. Callback queries are acknowledged before provider work so Telegram does not expire the interaction. The handler verifies that the clicking Telegram user owns the record and atomically claims Allow/Always Allow actions before execution. A repeated tap therefore cannot run the same mutation twice.

If an approval appears but a click fails, inspect the following in order:

1. Startup logs for approval table creation and Neon errors.
2. The pending row’s `telegram_id`, `status`, `provider`, and `operation`.
3. Provider credentials and write gates (`GITHUB_ALLOW_WRITES`, `NOTION_ALLOW_WRITES`, `GMAIL_ALLOW_WRITES`, `NALLPUTER_ALLOW_WRITES`, or the relevant tool policy).
4. Provider timeout or failure logs.
5. Whether the deployment is running the commit that includes immediate callback acknowledgement and atomic claims.

## NallPuter operations

The `nallputer` connector is disabled when `NALLPUTER_URL` is unset. The live adapter supports health, workspace listing, file reads, gated file writes, and gated command execution. Reserved process/log/test/build/restart operations fail explicitly until the remote computer profile supports them. Keep `NALLPUTER_TOKEN` server-side and set write/command gates to `false` unless the deployment is ready for explicit approval.

## Diagnostics

- `/memorycheck` runs a temporary isolated LightRAG write/read/delete diagnostic.
- `/rerankbench` measures the configured NVIDIA reranker endpoint.
- `/ingest` displays academic PDF guidance.
- `GET /health` confirms process availability.
- Render logs are the primary source for startup, webhook, model, database, approval, provider, LightRAG, ingestion, and voice failures.

## Routine release checks

1. Review the diff and confirm no secrets or user data are included.
2. Run `npm ci`.
3. Run `npm run typecheck`.
4. Run `npm test`.
5. Run `npm run build`.
6. Confirm the Docker build contains Poppler and FFmpeg.
7. If LightRAG is enabled, run `python -m compileall -q memory-service` and verify the private health endpoint.
8. Confirm startup creates the approval tables on a staging database.
9. Perform Telegram smoke tests for text, PDF ingestion, a denied mutation, an allowed mutation, and duplicate approval taps.
10. If voice is enabled, test one accepted note plus over-limit and provider-failure paths.
11. Verify memory isolation, reminder delivery, timezone handling, workspace boundaries, progress editing, and webhook secret validation.
12. Keep the previous working deployment available for rollback.

## Recovery

When a deploy fails, inspect the first failing build or startup step rather than changing unrelated dependency versions. Roll back to the last known-good image or commit, preserve the failing logs, and only retry provider mutations after confirming whether the original request actually completed.
