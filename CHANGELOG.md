# Changelog

Notable changes to NallyHermes are recorded here. The current development line is `3.1.0-alpha.1` on `v3.1-Emotions`; older V2 entries are historical release notes.

## [Unreleased] - 2026-11-24 (Grok-Self-Improvement-3.6)

### Self-improvement foundations

- Added `trajectories` and `learned_skills` tables to the Neon schema as the storage foundation for a Hermes-style closed learning loop.
- Introduced `src/agent/learning/` with core types, domain inference, and a reusable-trajectory heuristic.
- Added the `skill_manage` tool (list / get / propose / patch / accept / deprecate) to the agent tool surface. All mutating operations remain behind the existing approval gate.
- Branch created from `Manus-Work-Full-Deplex-v3.5` for the self-improvement + Personal Agency Kernel work.

## [Unreleased] - 2026-11-22

### Native voice review

- Delay `audio_start` until the first valid non-empty ElevenLabs PCM16 frame so the Android client cannot announce Speaking before audio exists; fail recoverably when synthesis finalizes with no audio, and validate base64/frame alignment.
- Log TTS completion byte/chunk counts and duration without recording transcript text or audio; add tests for empty and malformed provider audio.
- Documented the verified Deepgram segment-versus-utterance semantics, 300 ms endpointing choice, ElevenLabs final-text flush contract, Android audio timing bounds, and remaining device/provider validation gates.
- Documented why a regular Android app needs a microphone foreground service for ongoing wake-word capture, and why a `VoiceInteractionService`/user-selected assistant role is the distinct system-hotword route.
- Recorded the existing non-empty ElevenLabs final-text flush behavior; an empty text message closes the stream and is not a flush operation.

## [3.1.0-alpha.1] - 2026-11-15

This alpha consolidates the post-alpha.2 work recorded in the branch history from 2026-11-13 and 2026-11-15. It is not a stable release.

### Orchestration and research

- Added adaptive orchestra routing for direct conversation, bounded planning, channel-aware response style, partial synthesis, typed execution state, failure classification, and latency summaries.
- Added hybrid web search using Creepy Crawley as the primary backend and optional Tavily coverage, with basic/advanced depth, research query expansion, source tiering, and targeted fetch.
- Preserved the accuracy contract and deterministic claim audit for quantitative claims, unsupported approximations, proof-less tables, and incomplete evidence.

### Telegram voice

- Added Telegram voice/audio handling with message-id deduplication, declared duration and byte limits, bounded streaming downloads, and FFmpeg normalization to mono 16 kHz PCM WAV.
- Added Deepgram speech-to-text and ElevenLabs text-to-speech with provider timeouts, bounded retries/backoff, character limits, configurable speech speed, and spoken/text response splitting.
- Kept voice disabled by default unless `VOICE_ENABLED` and all required provider credentials are configured.

### Skills

- Added a repository-local progressive-disclosure skill registry.
- Imported and retained provenance for proven open-source skill packages covering coding, testing, research, documents, PDFs, spreadsheets, frontend work, citation management, Git workflows, Telegram voice, and related procedures.
- Injected only relevant full skill bodies into trusted context while keeping the compact skill catalog available for selection.

### Affect and conversation behavior

- Added a bounded affect layer with stress, confusion, warm, urgent, and baseline reply policies.
- Added topic-change decay and timing gates so user frustration does not turn into mirrored anger or unrestricted retries.
- Kept internal affect guidance non-narrative and separate from permission and safety decisions.

### NallPuter

- Added the dynamic `nallputer` connector and connected live health, workspace listing, file read, gated file write, and gated command operations to the bounded computer-kernel API.
- Kept the connector fail-closed when `NALLPUTER_URL` is not configured; reserved process, logs, test, build, and restart operations fail explicitly until supported by the remote VM profile.
- The separate `NallPuter` branch contains the initial isolated computer-kernel scaffold.

### Telegram inline approvals

- Added a universal mutation gate for file, memory, schedule, workflow, calendar, GitHub, Notion, Gmail, and NallPuter writes.
- Added persisted `pending_approvals` and per-user `approval_grants` state with Deny, Allow, and Always Allow inline buttons.
- Added startup creation and indexes for the approval tables so fresh deployments do not fail on the first approval request.
- Acknowledged callback queries before slow provider work and added atomic pending claims to prevent duplicate execution from repeated taps.

### Academic ingestion

- Kept ingestion Telegram-native: send a PDF as a document with optional `Course: ... | Title: ...` metadata or provide structured labels in a follow-up message.
- Bounded downloads at `INGESTION_MAX_UPLOAD_BYTES` (20 MB by default), stored files under the per-user academic workspace, and used Poppler `pdftotext -layout` with temporary output and actionable diagnostics.
- Preserved explicit statuses: `stored`, `stored_no_text`, `stored_extraction_failed`, `extracted`, `indexed`, and `extracted_index_failed`.
- Indexed extracted text through authenticated LightRAG only when enabled; Neon remains the source of truth for metadata and extracted text.
- Academic tool operations remain `list`, `search`, `get`, `delete`, and `rename`.

### Telegram presentation and runtime

- Kept rich-message Markdown as the preferred transport with HTML fallback and long-message splitting.
- Continued webhook secret validation, per-conversation serialization, user/chat-scoped durable history, and idempotent startup schema setup.
- Production image uses Node 22, Poppler, FFmpeg, and the optional LightRAG Python sidecar.

### Validation

- Current branch validation: TypeScript build passed; full regression suite passed with 83 tests and 1 skipped integration test when no live Neon URL is configured.

## [2.2.0-alpha.2] - 2026-11-13

Historical alpha.2 release on the V2.2 branch. It added the accuracy contract, richer web search, claim audit, academic tool registration, Telegram rich-message presentation, and earlier connector/workflow improvements. Later 3.1 alpha entries supersede its statements about voice, skills, affect, approvals, and NallPuter availability.

## [2.2.0-alpha.1] - 2026-11-11

### Bug fixes

- Fixed LightRAG's 2,048-dimension PostgreSQL HNSW warning by selecting pgvector's `HNSW_HALFVEC` index type, and extended the bounded LightRAG request timeout to 30 minutes for long academic documents.
- Updated the production image to Node 22 and made Debian package installation noninteractive.
- Fixed Render/Docker PDF extraction failures caused by missing `pdftotext` and large child-process stdout buffering.
- Added durable memory consent behavior, workflow mutation safeguards, event-vs-reminder guidance, Telegram document idempotency, scanned-PDF diagnostics, and the 20 MB default ingestion limit.

### Implemented

- Added typed memory records, active-memory context, dynamic Notion/Gmail/NallPuter dispatcher contracts, fail-closed credentials, explicit write gates, model-led adaptive routing, durable conversations, and workflow allowlists.

## [2.1.0] - 2026-11-11

- Connected Telegram PDF academic ingestion to authenticated LightRAG `/v1/academic/insert`.
- Used the same per-user LightRAG workspace as semantic memory retrieval and recorded `indexed` / `extracted_index_failed` statuses.
- Kept Neon as the source of truth for academic metadata and extracted text.

## [2.0.0-alpha.1] - 2026-11-08

- Started the V2 line with durable chat-scoped conversations, recurring workflows, provider-neutral Calendar boundaries, timezone-aware reminders, GitHub dispatcher foundations, academic companion persistence, and the custom adaptive orchestra.

## [1.0.0-beta.1] - 2026-11-06

- Added the original custom model-led orchestra, five initial native tools, Neon memory and schedules, optional LightRAG retrieval, timezone awareness, Telegram progress editing, natural communication guidance, workspace isolation, regression tests, and CI.
