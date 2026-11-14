# Changelog

Notable changes to NallyHermes are recorded here. Entries are based on commits present on the referenced development branch; they do not imply that a release has been tagged or that every external integration has been production-verified.

## [Unreleased] — v3.1-Emotions development branch (through 2026-11-14)

Branch head: `cdacc2af858221fc1f89db1470a09688c8fb829e`.

The v3.1 affect work was branched from `Voice-v3`. The commits below are grouped by feature area and ordered from earlier work to the latest stabilization where practical.

### Affect and conversational policy

- **v3.1 dual-track affect layer** (`bd2c404`, 2026-11-14): introduced separate `userAffect` (inferred from the current message) and `agentAffect` (updated by events and time decay); added topic-change decay to reduce cross-task mood carry-over; added meaningful-shift prompt hints; connected tool/task outcomes to agent state; added `AFFECT_ENABLED` (default true) and an in-memory store keyed by Telegram user ID.
- **Reply policies** (`4d5bb92`, 2026-11-14): added `urgent`, `stress`, `confuse` and `warm` policy selection with priority urgent > stress > confuse > warm; separated user confusion from frustration; applied acknowledge-align-act guidance, no intensity matching and concise practical responses.
- **Affect stabilization** (`cdacc2af`, 2026-11-14): fixed affect prompt phrase leakage and tightened the emotional prompt behavior.
- Added affect regression coverage for frustration non-mirroring, confusion response, warm greetings, topic-change decay and baseline no-hint behavior (`tests/affect.test.ts`).

### Universal write approvals

- **Universal Telegram approval gate** (`053ccce`, 2026-11-14): added Deny, Allow and Always Allow actions for write-capable tools across file I/O, memory, schedule, workflow, Calendar, GitHub, Notion, Gmail and NallPuter.
- Added Neon-backed `pending_approvals` and `approval_grants` persistence.
- Executor pauses mutations and emits an `approval_required` progress event; Allow executes the pending operation once; Always Allow persists the operation scope before executing.
- The model receives a `needs_approval` result so it can stop repeating approval requests.
- Approval callbacks validate Telegram ownership of the pending operation. Provider-specific write configuration remains a separate gate.

### NallPuter computer-kernel connector

- **Live NallPuter adapter** (`69c4d72`, 2026-11-14): connected the Hermes NallPuter tool to the live computer kernel.
- Added health, workspace listing, file read/write, process inspection, log retrieval, test/build execution, bounded command execution and service restart operations.
- Kept local `file_io` distinct from NallPuter session-computer operations.
- Added separate write and command gates. The connector is unavailable without `NALLPUTER_URL`.
- The adapter currently permits `NALLPUTER_TOKEN` to be absent until kernel-side authentication is enabled; this is a deployment security caveat, not evidence that the remote service is authenticated.
- **Fail-closed configuration stabilization** (`cdacc2af`, 2026-11-14): corrected NallPuter configuration handling so an unset endpoint does not silently trigger an unintended service call.

### Research and web retrieval

- **Hybrid search** (`03b53d9`, 2026-11-14): merged Nally Creepy Crawley and Tavily to improve coverage; deduplicates by URL, prefers extracted body content and sorts by source tier. Added `hybrid`, `creepy_crawley` and `tavily` modes; hybrid is the default.
- Added Nally Creepy Crawley as the primary search/fetch backend (`92ba3cf`, 2026-11-14), with a configured default service URL (`fac37d8`).
- Existing research behavior was retained: basic/advanced depth, research query planning, source tiers, extracted content and the evaluator's bounded claim-audit rewrite path (see the 2026-11-13 alpha.2 entry below).

### Runtime skills

- **Proven runtime skill library** (`f331f3c`, 2026-11-14): added a skills registry/library so relevant skill instructions can be discovered and selectively injected for matching work rather than loading every full skill body on every request.
- Skill provenance is recorded in `skills/PROVENANCE.md`.

### Voice and response channels

- **Production Telegram voice notes** (`d2ad8bc`, 2026-11-13): completed the Telegram voice-note integration using Deepgram STT and ElevenLabs TTS.
- Added audio normalization and bounded processing using FFmpeg; configured audio size, duration, provider timeout and retry limits.
- **Dual spoken/text response contract** (`df58c85`, 2026-11-13): split responses into `SPOKEN` content for TTS and `TEXT` content for links, sources, tables and other text-only material; set the default speech rate to 0.9 and allow an empty text section when there is nothing additional to show.
- **Voice context and partial response support** (`0e8c096`, 2026-11-13): added context-pack plumbing, partial-result synthesis and Deepgram/ElevenLabs integration boundaries.
- **Adaptive routing and response style** (`8a51871`, 2026-11-13): carried interaction channel and response style through the orchestra and introduced adaptive routing behavior.
- Fixed strict TypeScript issues in voice response splitting and progress-event handling (`15eb9fc`, `7b8e30f`).

### Telegram presentation and progress

- **Rich-message transport** (`8c73340`, `bb8bf23`, 2026-11-13): prefers Telegram Bot API rich Markdown messages for native headings, lists and tables, with existing HTML fallback and message splitting.
- Added connector progress labels, Telegram table presentation and GitHub batch-push behavior (`b9a38df`, 2026-11-13).
- Fixed progress event typing and approval callback payload typing in the latest branch stabilization commit (`cdacc2af`).

### Academic companion and connectors

- Added academic tool operations for indexed course PDFs and notes, including list/search/get/delete/rename (`0615028`, `cee5649`, 2026-11-13).
- Improved Telegram document metadata capture and structured Course/Title labeling without requiring a reply-to (`ace5f62`, `94186a2`, `0c8a832`, `9e0593`).
- Hardened LightRAG error handling and restored executor/LightRAG wiring after intermediate placeholder regressions (`e53288f`, `840e5d8`).
- Earlier V2.2 commits added Notion and Gmail adapters, typed memory/context, and the adaptive custom-orchestra foundation (`4a2238f`, `acbd3bd`, `638d099`).

### Earlier V2.2 alpha.2 work

## [2.2.0-alpha.2] - 2026-11-13

Work landed on `Manus-Work-NallyHermes-v2.2` after alpha.1. Domain tools for exact GitHub metrics and the full research eval harness remained deferred at that point.

### Accuracy and research
- Added an accuracy contract: restate the measurable ask, use tool-backed numbers and dates, prefer primary sources, label **Not verified** / **Partial**, and avoid unsupported approximate or “not disclosed” claims.
- Extended proof rules so factual tables include links, IDs/SHAs or dates and a **Source / Last checked** line.
- Upgraded `web_search` with basic/advanced depth, research query planning, source tiering and raw content on deeper hits.
- Added a deterministic claim audit for weak numerical claims, unsupported not-disclosed language, tables without proof and numeric claims without research evidence; a failed audit can trigger one rewrite.
- Added `tests/accuracy-contract.test.ts`.

### Telegram presentation
- Preferred Telegram rich Markdown messages when supported, retaining Markdown-to-HTML fallback and message splitting.

### Academic companion and connectors
- Registered academic list/search/get/delete/rename operations.
- Stabilized Telegram PDF ingestion, metadata labels, Poppler-based extraction and large-PDF streaming.
- Added Notion and Gmail adapters, connector progress labels and GitHub repository enumeration fixes.

### Bug fixes
- Restored `src/index.ts`, executor and LightRAG wiring after intermediate placeholder regressions.

### Deferred at alpha.2
- Exact multi-branch GitHub metrics.
- Stronger proof UX beyond rich-message support.
- A golden research evaluation harness in CI.

## [2.2.0-alpha.1] - 2026-11-11

### Bug fixes
- Fixed LightRAG's 2,048-dimensional PostgreSQL HNSW warning by selecting pgvector's `HNSW_HALFVEC` index type, and extended the bounded LightRAG request timeout to 30 minutes for long academic documents.
- Updated the production image to Node 22 and made Debian package installation noninteractive.
- Fixed PDF extraction deployment failures by installing `poppler-utils`, streaming large-PDF extraction through a temporary file and improving diagnostics.
- Made explicit durable user facts and preferences trigger a memory remember operation before acknowledgement.
- Prevented scheduled workflow runs from mutating reminders, calendars, files or connectors merely because their policy says `confirm_mutations`; interactive confirmation is required.
- Clarified that recurring schedules are not live event monitors and cannot claim to watch changing conditions between runs.
- Added Telegram document-update idempotency protection.
- Raised the default Telegram PDF ingestion limit to 20 MB.

### Implemented in alpha.1
- Added typed memory categories and bounded active-memory context.
- Added dynamic Notion, Gmail and NallPuter connector contracts with fail-closed credentials and explicit write gates.
- Implemented Notion REST and Gmail OAuth adapters.
- Replaced regex-led intent routing with a model-led adaptive orchestra path.
- Added connector configuration, executor validation, workflow allowlists and regression coverage.

## [2.1.0] - 2026-11-11

### Added
- Connected Telegram PDF academic ingestion to the existing LightRAG pipeline through an authenticated `/v1/academic/insert` endpoint.
- Indexed extracted academic text into the same per-Telegram-user LightRAG workspace used for semantic memory retrieval.
- Recorded `indexed` and `extracted_index_failed` statuses.

### Changed
- Neon remains the source of truth for academic document metadata and extracted text; LightRAG provides semantic and graph retrieval.

## [2.0.0-alpha.1] - 2026-11-08

### Added
- Started the V2 line on `Manus-Work-NallyHermes-v2`.
- Added a reproducible npm lockfile and durable conversation persistence in Neon, scoped by Telegram user and chat.
- Added durable recurring workflows with triggers, bounded instructions, tool allowlists, approval policy, Telegram delivery, retries and run history.
- Added a provider-neutral Calendar connector boundary and strict Calendar list/create/update/cancel operations.
- Added natural-language reminder composition and active-topic follow-up guidance.
- Started the hand-built orchestra improvement track with adaptive routing, execution state, phase telemetry, typed failures, event-monitoring primitives and voice-ready interfaces.
- Started Academic Companion ingestion and structured academic data.
- Added the GitHub dynamic dispatcher foundation with server-side PAT authentication, repository allowlisting and a separate write gate.

### Changed
- Telegram requests load and persist prior user/assistant history.
- Workflow runs execute through bounded orchestration and cannot request tools outside their allowlist.
- Calendar is never treated as connected without provider credentials.
- Reminder task text is untrusted input and cannot change system instructions or permissions.

## [1.0.0-beta.1] - 2026-11-06

### Added
- Custom model-led agent orchestra with smart planning, dependency tracking, bounded execution and evidence-based reporting.
- Initial web search, fetch, file I/O, memory and scheduling tools.
- Neon-backed user memory and schedules with optional LightRAG retrieval.
- User timezone awareness, recurring reminders and Telegram progress-message editing.
- Initial automated Telegram presentation tests and GitHub Actions CI.

### Improved
- Conversation history isolation by Telegram chat and participant.
- Workspace path validation rejects symbolic-link escapes.
- LightRAG startup is conditional on `LIGHTRAG_ENABLED`.

### Notes
- This was an early beta snapshot. See the current branch documentation and release checklist for present capabilities and outstanding release gates.
