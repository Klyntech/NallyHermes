# Changelog

Notable changes to NallyHermes are recorded here.

## [2.0.0-alpha.1] - 2026-11-08

### Added
- Started the V2 line on the `Manus-Work-NallyHermes-v2` branch.
- Added a reproducible npm lockfile.
- Added durable conversation persistence in Neon, scoped by Telegram user and chat.
- Added startup migration and indexing for the Telegram chat conversation scope.
- Added durable recurring workflows with triggers, bounded instructions, allowed tools, approval policy, Telegram delivery, retry policy and run history.
- Added opt-in Neon integration coverage for conversation isolation and workflow persistence.
- Added orchestration tests for workflow tool policies and timezone-aware recurrence.

### Changed
- Telegram requests now load prior user/assistant history from Neon and persist each completed exchange.
- Workflow runs are executed through the bounded orchestra and cannot request tools outside their allowlist.

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
