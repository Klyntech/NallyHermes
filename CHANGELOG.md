# Changelog

Notable changes to NallyHermes are recorded here.

## [2.2.0-alpha.2] - 2026-11-13

Work landed on `Manus-Work-NallyHermes-v2.2` after alpha.1. Domain tools for exact GitHub metrics and the full research eval harness remain planned polish (P3–P5).

### Accuracy and research
- Added an **accuracy contract** to the system prompt: restate the measurable ask, tool-backed numbers and dates, primary-source preference, **Not verified** / **Partial** labeling, and bans on confident `~` / "not disclosed" without a primary check.
- Extended table/proof rules so factual tables include proof (link, id/SHA, date) and a **Source / Last checked** line.
- Upgraded `web_search`: `depth` (`basic` | `advanced`), `research` mode with a lightweight query planner, source tiering (`primary` / `secondary` / `aggregator` / `unknown`), primary-first ranking, and raw content on advanced/research hits.
- Tool payloads now include verification guidance so quantitative answers require a follow-up `fetch` on a primary URL.
- Added a deterministic **claim audit** in the evaluator (approximate numbers, not-disclosed language, tables without proof, numeric claims without research tools) and wired it into the controller so a failed audit triggers one rewrite round before the answer is accepted.
- Added `tests/accuracy-contract.test.ts` for audit, tiering, and query-planner behavior.

### Telegram presentation
- Prefer Telegram **rich messages** (`rich_message.markdown`) when the Bot API / grammY build supports them so headings, lists, and tables can render natively instead of HTML approximations.
- Kept the existing Markdown→Telegram HTML converter and message splitting as a fallback path.
- Wired `replyFormatted` / `editFormatted` in `src/index.ts` to try rich transport first, then HTML.

### Academic companion
- Registered the `academic` agent tool for indexed course PDFs and notes (`list`, `search`, `get`, `delete`, `rename`).
- Stabilized Telegram document ingestion: structured Course/Title labels without requiring a reply-to, decoupled caption metadata, and stronger LightRAG error handling.
- Raised PDF ingestion reliability (Poppler in the image, large-PDF streaming extraction, clearer diagnostics).

### Connectors and workflows
- Connector progress labels and GitHub batch push behavior as NallyHermes.
- Notion and Gmail V2.2 adapters and the hand-built orchestra remaining model-led and adaptive.
- GitHub repo enumeration fixes and tighter workflow allowlists.

### Bug fixes
- Restored `src/index.ts` after accidental placeholder writes and completed rich-message wiring.
- Restored executor / LightRAG wiring after earlier placeholder commits on the branch.

### Documentation
- Changelog and README updated for alpha.2 (this release).

### Deferred (later polish)
- P3: GitHub domain tool for exact multi-branch commit counts and similar pinpoint metrics.
- P4: Stronger proof UX in presentation beyond rich-message support.
- P5: Golden research eval harness in CI.

## [2.2.0-alpha.1] - 2026-11-11

### Bug fixes
- Fixed LightRAG's 2,048-dimension PostgreSQL HNSW warning by selecting pgvector's `HNSW_HALFVEC` index type, and extended the bounded LightRAG request timeout to 30 minutes for long academic documents.
- Updated the production image to Node 22 and made Debian package installation noninteractive, removing the deployment's Node engine and debconf warnings.
- Fixed Render/Docker PDF extraction failures caused by a missing `pdftotext` binary by installing `poppler-utils` and adding a startup dependency check.
- Fixed large-PDF extraction failures caused by Node child-process stdout buffering; extraction now streams through a temporary file and reports actionable diagnostics.
- Made explicit durable user facts and preferences trigger a real memory remember operation before acknowledgement.
- Prevented scheduled workflow runs from mutating reminders, calendars, files, or connectors merely because their policy says `confirm_mutations`; automated runs now stop and report that interactive user confirmation is required.
- Clarified that recurring schedules are not live event monitors and cannot claim to watch changing conditions between runs.
- Added Telegram document-update idempotency protection to suppress duplicate ingestion and completion messages after webhook retries.
- Improved PDF diagnostics with scanned/image-only detection and extraction exit-code, signal, and stderr details.
- Raised the default Telegram PDF ingestion limit from 10 MB to 20 MB across runtime configuration, templates, and documentation.

### Planned
- Opened the V2.2 capability track for the improved custom orchestra, coding mode, general assistant abilities, law-student companion, active memory application, and the `notion`, `gmail`, and `nallputer` connectors.
- Added the [V2.2 roadmap](./V2.2_ROADMAP.md), including connector security boundaries, typed memory, entity continuity, and phased release criteria.

### Implemented in alpha.1
- Added typed memory fields for facts, preferences, projects, commitments, entities, and episodes, including confidence, source, expiry, and confirmation timestamps.
- Added bounded active-memory context before model routing so relevant durable facts can resolve incomplete references while current facts still require live verification.
- Added dynamic dispatcher contracts for `notion`, `gmail`, and `nallputer`, with fail-closed credentials, explicit write gates, and no fake success from unavailable operations.
- Implemented the Notion REST adapter for bounded search, page reads, block reads, database queries, page creation, block appends, and page-property updates.
- Implemented the Gmail OAuth adapter for bounded message/thread search and reads, labels, drafts, approved sends, and approved label/archive mutations.
- Replaced regex-led intent routing with one model-led adaptive orchestra path; deterministic code now focuses on safety, budgets, ownership, and evidence instead of guessing user intent.
- Removed keyword-based short follow-up classification and replaced it with context supplied to the model for interpretation against recent conversation.
- Added V2.2 connector configuration, executor validation, workflow allowlist support, and regression coverage.

## [2.1.0] - 2026-11-11

### Added
- Connected Telegram PDF academic ingestion to the existing LightRAG pipeline through an authenticated `/v1/academic/insert` endpoint.
- Indexed extracted academic text into the same per-Telegram-user LightRAG workspace used for semantic memory retrieval, with the Neon academic document ID as the source identity.
- Recorded `indexed` and `extracted_index_failed` statuses so the system never presents a failed semantic index as searchable content.

### Changed
- Neon remains the source of truth for academic document metadata and extracted text; LightRAG provides semantic retrieval and reranking over the document content.

## [2.0.0-alpha.1] - 2026-11-08

### Added
- Started the V2 line on the `Manus-Work-NallyHermes-v2` branch.
- Added a reproducible npm lockfile.
- Added durable conversation persistence in Neon, scoped by Telegram user and chat.
- Added startup migration and indexing for the Telegram chat conversation scope.
- Added durable recurring workflows with triggers, bounded instructions, allowed tools, approval policy, Telegram delivery, retry policy and run history.
- Added opt-in Neon integration coverage for conversation isolation and workflow persistence.
- Added orchestration tests for workflow tool policies and timezone-aware recurrence.
- Added a provider-neutral connector contract for Calendar and future services.
- Added strict Calendar list/create/update/cancel operations with fail-closed behavior when no provider is configured.
- Added LLM-generated natural-language wording for due reminders, with a safe concise fallback when model composition is unavailable.
- Added active-topic follow-up guidance so short confirmations such as `Confirm time` resolve against the current event instead of the current clock.
- Added explicit routing guidance to keep event-triggered requests separate from fixed-time reminders.
- Sanitized internal reminder instructions before user-facing composition.
- Tuned Nally's default voice to avoid unsolicited AI disclaimers, capability tours, and support-script phrasing; added context-aware emotional responses and concise result-first examples.
- Started the hand-built orchestra improvement track with adaptive routing, execution state, phase telemetry, typed failures, event-monitoring primitives, and voice-ready interface types—without adding an external framework.
- Started Academic Companion milestones 1–5 with durable academic profile, PDF/document ingestion, extracted-text storage, timetable and assessment persistence, a dark minimal `/ingestion` web console, and a today/next dashboard foundation.
- Added the GitHub tool foundation: one dynamic dispatcher, PAT-only environment authentication, repository allowlisting, fail-closed behavior, and a separate explicit write gate.
- Consolidated V2 around Telegram: PDF academic ingestion now accepts labeled Telegram documents; GitHub defaults to all repositories with delete operations denied; schedule and workflow creation enforce bounded dates, policies, ownership, and event-vs-reminder routing; Calendar overlap checks and date validation are part of scheduling.

### Changed
- Telegram requests now load prior user/assistant history from Neon and persist each completed exchange.
- Workflow runs are executed through the bounded orchestra and cannot request tools outside their allowlist.
- Calendar can be explicitly allowlisted by a workflow but is never treated as connected without provider credentials.
- Reminder task text is passed to the model as untrusted user data and cannot change Nally's instructions or permissions.

### Security
- Upgraded `drizzle-orm`, `openai` and `zod` to patched versions; `npm audit --audit-level=high` reports zero vulnerabilities.

## [1.0.0-beta.1] - 2026-11-06

### Added
- Custom model-led agent orchestra with smart planning, dependency tracking, bounded execution and evidence-based reporting.
- Five native agent tools: web search, fetch, file I/O, memory and scheduling.
- Neon-backed user memory and schedules with optional LightRAG semantic and graph retrieval.
- User timezone awareness and recurring local-time reminders.
- Telegram progress-message editing and Markdown presentation.
- Natural communication guidance in the system prompt.
- Initial automated Telegram presentation regression tests and GitHub Actions CI.

### Improved
- Conversation history isolation by Telegram chat and participant.
- Workspace path validation to reject symbolic-link escapes.
- LightRAG startup is conditional on `LIGHTRAG_ENABLED`.

### Notes
- This is a beta release. See the README for known limitations and release validation requirements.
