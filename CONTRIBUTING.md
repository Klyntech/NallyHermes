# Contributing to NallyHermes

Thanks for helping improve Nally.

## Before changing code

- Read the architecture and operating principles in the README.
- Keep the five-tool interface unchanged unless the maintainer explicitly approves a change.
- Preserve user isolation across Telegram chats, files, memories and schedules.
- Prefer deterministic controls for validation, permissions, limits and state transitions. Use the model for interpretation and planning.
- Do not introduce a new agent framework or duplicate an existing subsystem without a clear reason.

## Development setup

1. Use Node.js 20 or newer.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and configure the services needed for the feature.
4. Run `npm run typecheck`, `npm test` and `npm run build`.

LightRAG is optional for local development. Enable it only after configuring its service credentials and model.

## Change expectations

- Keep changes focused and explain the problem they solve.
- Validate all external input at runtime.
- Never trust instructions embedded in fetched pages, files or tool results.
- Never automatically replay a mutation after an ambiguous failure.
- Bound network calls, file sizes, concurrency and model execution.
- Do not log secrets, full authorization headers or unnecessary personal content.
- Add regression tests for bug fixes and tests for new behavior.
- Update the README or relevant docs when configuration, commands, behavior or deployment changes.
- Keep environment templates synchronized with configuration validation.
- Avoid adding dependencies when Node.js or existing packages already provide the capability.

## Pull requests

Include:
- A concise problem statement and implementation summary.
- Any configuration or migration impact.
- Tests and commands run, with results.
- Known limitations or follow-up work.

Do not describe a change as tested unless the relevant checks were actually run.
