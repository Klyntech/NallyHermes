# 3.1 Alpha Release Checklist

Use this checklist before promoting the `v3.1-Emotions` line to a staging or production deployment. This is an alpha checklist; it does not declare the project stable.

## Repository and version

- [ ] Confirm `package.json` and `package-lock.json` report the intended version.
- [ ] Confirm the changelog and README describe the same branch and release line.
- [ ] Review the diff for secrets, user data, generated artifacts, and stale documentation.
- [ ] Run `npm ci` from the committed lockfile.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Review dependency advisories and document any accepted risk.
- [ ] Keep the repository license decision explicit; public visibility does not grant reuse rights.

## Runtime and Telegram

- [ ] Telegram private-chat text smoke test.
- [ ] Group-chat participant and conversation isolation test.
- [ ] Natural conversation, short follow-up, and timezone tests.
- [ ] Simple request uses the direct path; a genuinely complex request uses bounded planning.
- [ ] Progress message edits, rich-message fallback, HTML fallback, and long-message splitting work.
- [ ] Webhook secret validation rejects incorrect headers.
- [ ] Duplicate webhook delivery does not duplicate voice or academic ingestion work.

## Academic ingestion

- [ ] `/ingest` explains the current caption format.
- [ ] PDF with `Course: ... | Title: ...` stores the expected metadata.
- [ ] Follow-up structured labels work without relying on Telegram reply-to.
- [ ] Oversized files are rejected before processing.
- [ ] Text PDF reaches `extracted` or `indexed` as appropriate.
- [ ] Scanned/image-only PDF reaches `stored_no_text` with an actionable message.
- [ ] Extraction failure reaches `stored_extraction_failed` and preserves diagnostics.
- [ ] LightRAG failure reaches `extracted_index_failed` and is not presented as searchable content.
- [ ] Academic delete removes only the requesting user’s document and bounded local file.

## Voice

- [ ] Voice remains disabled when `VOICE_ENABLED=false`.
- [ ] Enabled voice configuration includes Deepgram, ElevenLabs, and voice ID values.
- [ ] Accepted Telegram voice/audio input is byte-limited and FFmpeg-normalized.
- [ ] Overlong or oversized notes are rejected.
- [ ] Deepgram and ElevenLabs timeout/retry behavior is bounded.
- [ ] Spoken output is clipped to `VOICE_TTS_MAX_CHARS`; detailed links and sources remain in text.
- [ ] Duplicate Telegram voice updates produce one response.

## Skills, affect, and orchestration

- [ ] Relevant repository skills are selected without loading unrelated full bodies.
- [ ] Skill instructions do not override tool, privacy, approval, or budget boundaries.
- [ ] Stress, confusion, warm, and urgent affect policies remain concise and do not narrate internal emotions.
- [ ] Claim audit rejects or rewrites unsupported quantitative claims.
- [ ] Read-only concurrency stays within configured limits; mutations are sequential and not automatically replayed.

## Inline approvals and connectors

- [ ] Startup creates `approval_grants`, `pending_approvals`, and their indexes on a staging database.
- [ ] File, memory, schedule, calendar, connector, and NallPuter mutations pause before execution.
- [ ] Telegram displays Deny / Allow / Always Allow buttons.
- [ ] Callback queries are acknowledged before slow provider work.
- [ ] Deny records `denied` and performs no mutation.
- [ ] Allow executes once and records `executed` or `failed`.
- [ ] Always Allow persists only the intended provider/operation scope.
- [ ] Repeated taps cannot execute the same pending mutation twice.
- [ ] Ownership checks prevent another Telegram user from approving the request.
- [ ] GitHub, Notion, Gmail, Calendar, and NallPuter fail closed when credentials or write gates are absent.

## Deployment and operations

- [ ] Docker build uses Node 22 and includes Poppler and FFmpeg.
- [ ] `GET /health` responds after startup.
- [ ] If LightRAG is enabled, the sidecar passes its private health check and binds only to localhost.
- [ ] Persistent disk is configured when local workspace files must survive deploys.
- [ ] Neon backup and recovery expectations are documented.
- [ ] Logs do not expose tokens, secrets, full authorization headers, or unnecessary personal content.
- [ ] Rollback to the previous deployment is available.

## Stable-release blockers

Do not call this line stable while live integration coverage, dependency review, license selection, secret-handling review, approval smoke tests, or production rollback procedures remain unresolved.
