# Changelog

Notable changes to NallyHermes are recorded here.

## [2.2.0-alpha.1] - 2026-11-11

### Planned
- Opened the V2.2 capability track for the improved custom orchestra, coding mode, general assistant abilities, law-student companion, active memory application, and the `notion`, `gmail`, and `nallputer` connectors.
- Added the [V2.2 roadmap](./V2.2_ROADMAP.md), including connector security boundaries, typed memory, entity continuity, and phased release criteria.

### Implemented in alpha.1
- Added typed memory fields for facts, preferences, projects, commitments, entities, and episodes, including confidence, source, expiry, and confirmation timestamps.
- Added bounded active-memory context before model routing so relevant durable facts can resolve incomplete references while current facts still require live verification.
- Added dynamic dispatcher contracts for `notion`, `gmail`, and `nallputer`, with fail-closed credentials, explicit write gates, and no fake success from unavailable operations.
- Implemented the Notion REST adapter for bounded search, page reads, block reads, database queries, page creation, block appends, and page-property updates.
- Implemented the Gmail OAuth adapter for bounded message/thread search and reads, labels, drafts, approved sends, and approved label/archive mutations.
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
