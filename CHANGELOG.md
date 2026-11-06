# Changelog

Notable changes to NallyHermes are recorded here.

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
