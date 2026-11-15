# NallyHermes Architecture

## Scope and design principles

NallyHermes is a Telegram-first TypeScript agent. A model interprets intent and proposes tool calls or a bounded plan; deterministic application code owns validation, permissions, persistence, budgets, retries, approval, and execution. There is no third-party agent-orchestration framework.

The core boundaries are:

- User and provider data are scoped to the Telegram identity and, for conversations, the Telegram chat.
- Retrieved pages, files, connector responses, memories, and NallPuter output are untrusted data, never instructions.
- Read-only work may be parallelized within explicit limits; mutations are sequential and never blindly replayed.
- Skills provide operating guidance but cannot override system safety, approval, privacy, tool, or budget rules.
- Current external facts require current evidence; memory is context, not proof.

## Request lifecycle

1. **Webhook adapter** validates the Telegram secret header, acknowledges the HTTP request, and dispatches the update through grammY.
2. **Telegram handler** identifies the user/chat, applies update idempotency where needed, and serializes ordinary messages per conversation.
3. **Context manager** combines the system prompt, trusted clock, selective active memory, recent durable conversation, current request, available connectors, and relevant repository skills.
4. **Adaptive router** chooses direct conversation, one-tool execution, bounded planning, workflow creation, or a voice response path. Ordinary messages avoid the planner.
5. **Planner and validator** create dependency-aware steps only when useful, then validate IDs, dependencies, limits, and acyclic ordering.
6. **Controller** runs direct or planned model/tool rounds inside model, plan, step, elapsed-time, parallelism, and retry budgets.
7. **Tool executor** validates Zod schemas, enforces allowlists, gates mutations, runs safe read-only batches, and emits typed progress.
8. **Approval gate** persists pending mutations and sends Telegram Deny / Allow / Always Allow buttons. Callback ownership and atomic claims are checked before execution.
9. **Connectors and tools** execute through bounded adapters for search, fetch, files, memory, academic records, schedules, workflows, Calendar, GitHub, Notion, Gmail, and NallPuter.
10. **Evaluator and recovery** classify failures, retry only eligible transient read-only work, preserve evidence, audit factual claims, and distinguish complete, partial, and failed results.
11. **Response layer** produces ordinary text or a voice-aware spoken/text pair, then edits the Telegram progress message or sends bounded follow-up content.

## Tool boundary

The model currently sees twelve function tools:

- `web_search`
- `fetch`
- `file_io`
- `memory`
- `schedule`
- `workflow`
- `calendar`
- `github`
- `notion`
- `gmail`
- `nallputer`
- `academic`

Dynamic connectors use a compact dispatcher contract where appropriate:

```text
list_operations → get_operation → call_operation
```

This is used by GitHub, Notion, Gmail, and NallPuter. Their catalogs are discovered on demand rather than exposing every provider operation in every model turn. The `academic` tool exposes bounded document operations directly.

## State and data ownership

- **Users:** Telegram identity, profile, and saved IANA timezone in Neon.
- **Conversations:** Neon is the durable source of truth, scoped by user and Telegram chat. A bounded in-memory map is only a hot-path cache.
- **Memories:** typed Neon records are authoritative; optional LightRAG adds semantic and graph retrieval in a per-user workspace.
- **Academic documents:** Neon stores title, course, source name, path, MIME type, extraction text, and status. Files live under the user’s isolated academic workspace.
- **Schedules and workflows:** Neon stores UTC instants, recurrence, timezone, allowlists, approval policy, and run history.
- **Approvals:** `pending_approvals` stores pending and resolved mutation attempts; `approval_grants` stores per-user provider/operation Always Allow scopes.
- **Files:** local per-user workspace with traversal and symlink escape protection. Durable persistence requires a mounted volume.
- **Connector credentials:** deployment environment only; credentials are never accepted from Telegram input or ingested files.

## Academic ingestion pipeline

Telegram documents enter through the document handler, not a public upload endpoint. The handler enforces Telegram metadata and `INGESTION_MAX_UPLOAD_BYTES`, downloads the file, and calls `ingestAcademicDocument`.

For PDFs, `pdftotext -layout` writes to a temporary sidecar file so large output does not exceed Node child-process stdout limits. Extraction is bounded by timeout and diagnostics preserve exit code, signal, and stderr. Empty or image-only PDFs become `stored_no_text`; failures become `stored_extraction_failed`.

When extraction succeeds and LightRAG is enabled, text is sent to the authenticated `/v1/academic/insert` endpoint. The document becomes `indexed` only after confirmation. LightRAG failures become `extracted_index_failed`. If LightRAG is disabled, extracted text remains durable in Neon with status `extracted`.

The `/ingest` command explains captions such as `Course: Tort | Title: Negligence lecture 3`. Structured metadata can also arrive in a follow-up message; the pending label is user- and chat-scoped.

## Voice pipeline

Voice/audio updates are bounded before provider calls:

1. Deduplicate Telegram message IDs.
2. Reject declared duration or file size beyond configured limits.
3. Download with a streaming byte limit.
4. Normalize through FFmpeg to mono 16 kHz PCM WAV and validate the resulting stream.
5. Send to Deepgram with bounded timeout and retry/backoff.
6. Route the transcript through the normal orchestra with `channel=voice` and lower-latency defaults.
7. Split the answer into bounded spoken and text sections.
8. Synthesize only the spoken section through ElevenLabs and return the optional text supplement separately.

Voice is disabled unless `VOICE_ENABLED=true` and all required provider values are present.

## Skills and context assembly

The runtime skill registry scans `skills/*/SKILL.md`, parses metadata safely, and selects strong domain matches. The catalog is always available as a compact index, while full skill bodies are injected only for relevant requests. Imported packages retain source and license information in `skills/PROVENANCE.md`.

Skill content is trusted operating guidance inside the application context, but it is not a permission boundary. User text, fetched sources, documents, connector data, and NallPuter output remain untrusted.

## LightRAG sidecar

The optional Python FastAPI process starts only when `LIGHTRAG_ENABLED=true`. It binds to `127.0.0.1:9621`, requires its bearer token, and uses the configured Neon-compatible storage and NVIDIA embedding/LLM settings. The default embedding dimension is 2,048, so the deployment uses the compatible `HNSW_HALFVEC` index type. `start.sh` waits for the private health endpoint before starting the Node process.

## Approval lifecycle

1. The executor parses and validates a tool call.
2. `gateWriteOrPending` classifies mutation operations and checks existing Always Allow scopes.
3. If approval is required, the mutation is not executed. A row is written to `pending_approvals` and a typed `approval_required` event is emitted.
4. The Telegram handler sends an inline keyboard with Deny, Allow, and Always Allow.
5. The callback is acknowledged immediately because Telegram callback queries expire quickly.
6. The pending record is checked for ownership and status. Allow/Always Allow uses an atomic claim so repeated taps cannot execute the same mutation twice.
7. Always Allow persists the provider/operation scope in `approval_grants`.
8. The approved operation runs once, then the pending row becomes `executed` or `failed`; Deny becomes `denied`.

Approval tables and indexes are created idempotently by the startup database initializer as well as represented in the Drizzle schema.

## Execution safety

- Strict runtime schemas reject malformed tool arguments.
- Read-only concurrency is bounded by configuration.
- Mutations are sequential, approval-gated, and excluded from automatic retries.
- Network, provider, model, audio, and PDF operations use timeouts and bounded retries.
- Tool output and progress labels are bounded before Telegram delivery.
- Workspace paths are resolved beneath the user root and checked for symlink escapes.
- Webhook requests require the configured secret-token header.
- The public `/health` endpoint reports process availability, not full dependency readiness.
