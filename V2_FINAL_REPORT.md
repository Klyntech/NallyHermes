# NallyHermes V2 / V2.1 Final Report

## Release status

V2 is complete and V2.1 is the academic retrieval increment on the `Manus-Work-NallyHermes-v2` branch. The release keeps the custom NallyHermes orchestra and adds companion persistence, Telegram-native academic ingestion, LightRAG-backed document indexing, token-authenticated GitHub operations, Calendar-aware scheduling, and stricter workflow execution boundaries.

Latest release commit: `0b1332a` — Release V2.1 with LightRAG academic ingestion.

## Academic Companion

Academic ingestion now happens through Telegram instead of a separate web endpoint. Send Nally a PDF as a document. Optional captions can label it:

`Course: Tort | Title: Negligence lecture 3`

Nally creates the user academic record when needed, downloads the Telegram document, stores it under the isolated user workspace, extracts PDF text with `pdftotext`, and records source metadata plus extraction status in Neon. The `/ingest` command explains the format.

In V2.1, successful extracted text is sent to the existing authenticated LightRAG service through `/v1/academic/insert`. The document is indexed into the same per-Telegram-user LightRAG workspace used by semantic memory retrieval, with the Neon academic document ID as its source identity. Neon remains the source of truth for metadata and extracted text. Documents are marked `indexed` only after LightRAG confirms insertion; failures are recorded as `extracted_index_failed`.

Durable academic tables cover profiles, documents, timetable entries, and assessments. Extracted text is now available as the source layer for the next grounded study features.

## GitHub tools

GitHub is exposed to Nally as one dynamic `github` dispatcher. The request flow is:

`list_operations → get_operation → call_operation`

The catalog now covers repository metadata, issues, pull requests, commits, branches, tags, releases, Actions workflows and runs, repository contents, comparisons, collaborators, assignees, labels, comments, reviews, checks, statuses, deployments, forks, stargazers, watchers, authenticated user, public users, user repositories, organization repositories, gists, and approved write operations.

Authentication uses only the server-side `GITHUB_TOKEN` PAT. Tokens are never accepted from Telegram, academic files, or tool arguments.

Repository access is open by default through `GITHUB_ALLOW_ALL_REPOS=true`. Deployments that need restriction can set it to `false` and provide `GITHUB_ALLOWED_REPOS`.

Delete operations are not exposed and are explicitly rejected by policy. Other writes require both `GITHUB_ALLOW_WRITES=true` and an explicit `approved: true` tool argument. GitHub mutations are not automatically retried.

## Scheduling and Calendar

Schedule creation now rejects event-trigger language such as “when the match starts” and “keep checking” when no recurrence is supplied. Those requests must use a workflow or monitoring path rather than being converted into guessed clock-time reminders.

Schedule validation now enforces:

- Explicit timezone-bearing ISO timestamps
- Future first runs
- A bounded one-year horizon
- Valid recurring cadence
- User-scoped cancellation
- Safe schedule identifiers
- Bounded task size

When Calendar is configured, scheduling checks a surrounding time window for overlaps before saving. Calendar list and create operations now validate ISO timestamps, positive ranges, and a maximum one-year window. A provider failure prevents silent scheduling rather than pretending the conflict check succeeded.

## Workflow hardening

Workflow creation now enforces:

- Future first run within one year
- Maximum instruction size
- Supported tool names only
- Maximum tool count
- `read_only` or `confirm_mutations` approval policies
- No mutation-capable tools in `read_only` workflows
- Telegram as the only V2 output destination
- Bounded retry attempts and backoff

Workflow execution remains owned by the custom worker and records run history, attempts, failures, and next-run behavior.

## Custom orchestra

The hand-built orchestra now includes:

- Adaptive direct versus planned routing
- First-class execution state
- Phase latency instrumentation
- Typed tool-failure categories
- Conservative retries for read-only transient failures
- Event-monitor state primitives
- Workflow tool allowlists
- Voice-ready interfaces for a later release

No LangChain, AutoGen, CrewAI, Mastra, or other orchestration framework was added.

## Security boundaries

- Telegram webhook requests require the configured secret token.
- Academic documents are scoped to the Telegram user who sent them.
- GitHub uses a deployment-only PAT.
- GitHub repository scope can be restricted with an allowlist.
- GitHub deletes are denied.
- GitHub writes require a feature gate and explicit approval.
- Calendar is fail-closed when not configured.
- Workflow mutations are bounded by policy and allowlists.
- File workspace paths reject traversal and symlink escapes.
- Retrieved files, web pages, documents, and GitHub content are treated as untrusted data.

## Required deployment configuration

```env
TELEGRAM_BOT_TOKEN=...
NVIDIA_NIM_API_KEY=...
DATABASE_URL=...
WEBHOOK_URL=https://...
WEBHOOK_SECRET=...

# GitHub
GITHUB_TOKEN=...
GITHUB_ALLOW_ALL_REPOS=true
GITHUB_ALLOWED_REPOS=
GITHUB_ALLOW_WRITES=true

# Academic PDFs sent through Telegram
INGESTION_MAX_UPLOAD_BYTES=20000000
```

Keep `GITHUB_TOKEN` separate from Telegram and application webhook secrets. If write access is not required, leave `GITHUB_ALLOW_WRITES=false`.

## Validation evidence

The V2 release validation completed successfully:

- TypeScript typecheck passed
- 32 automated tests passed
- 1 Neon integration test skipped because no integration database was configured
- Production build passed
- Python memory-service compilation passed
- `npm audit --audit-level=high` reported zero vulnerabilities
- Git diff validation passed
- PDF extraction utility verified on the runtime

## V2 boundary

Voice remains intentionally deferred. The next major version can add grounded academic retrieval and citations over the ingested documents, case briefs, IRAC analysis, timetable-aware daily briefings, and durable condition-monitoring providers on top of this V2 foundation.
