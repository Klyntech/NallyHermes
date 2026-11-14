# Operations

This guide reflects the `v3.1-Emotions` branch. Optional providers are not considered available merely because their code exists; each must be configured and verified independently.

## Runtime and deployment

The Docker image uses Node 22 and installs Python 3, Poppler (`pdftotext`) and FFmpeg. It prepares the Python dependencies for the LightRAG service, compiles the TypeScript application, exposes port 3000 and starts through `start.sh`.

Deploy as a Render Docker Web Service:

1. Connect the GitHub repository and select Docker.
2. Configure the required Telegram, NVIDIA and Neon environment variables.
3. Set `WEBHOOK_URL` to the public HTTPS Render service URL.
4. Generate a `WEBHOOK_SECRET` of at least 32 allowed characters.
5. Configure only the optional providers needed by this deployment.
6. Keep the LightRAG sidecar on `127.0.0.1:9621`; do not publish its port.
7. Attach a persistent disk and set `FILE_WORKSPACE` to its mount path if local user files must survive restarts/deploys.
8. Deploy, inspect startup logs, verify health, then run Telegram and provider-specific smoke tests.

The Docker startup path starts LightRAG only when `LIGHTRAG_ENABLED=true`. When enabled, LightRAG must have its own API token (at least 32 characters) and model configured. Its default URL is internal localhost. The service uses 2,048-dimensional Nemotron embeddings and `HNSW_HALFVEC`; regular pgvector HNSW indexes reject dimensions above 2,000. Academic indexing can take several minutes, so `LIGHTRAG_REQUEST_TIMEOUT_MS` defaults to 30 minutes.

## Required configuration

| Variable | Requirement |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `NVIDIA_NIM_API_KEY` | NVIDIA NIM API key |
| `DATABASE_URL` | Neon PostgreSQL connection URL |
| `WEBHOOK_URL` | Public HTTPS webhook base URL |
| `WEBHOOK_SECRET` | At least 32 characters; letters, numbers, underscore or hyphen |

`NVIDIA_NIM_BASE_URL`, `NVIDIA_NIM_MODEL`, `DEFAULT_TIMEZONE`, `PORT` and `FILE_WORKSPACE` have defaults in `src/config.ts`.

## Optional capability configuration

| Capability | Enablement / credentials | Default and safety boundary |
| --- | --- | --- |
| Affect | `AFFECT_ENABLED` | Enabled by default; set false to disable |
| Web search | `CREEPY_CRAWLEY_API_KEY`, `TAVILY_API_KEY` | `WEB_SEARCH_MODE=hybrid`; at least one provider must be configured |
| LightRAG | `LIGHTRAG_ENABLED=true`, token and model | Disabled by default; internal localhost service |
| Google Calendar | OAuth client/refresh credentials, `GOOGLE_CALENDAR_ENABLED=true`, Telegram ID allowlist | Disabled by default; per-user allowlist |
| GitHub | `GITHUB_TOKEN` | Repository access open by default; restrict with `GITHUB_ALLOW_ALL_REPOS=false` and `GITHUB_ALLOWED_REPOS`; writes default false |
| Notion | `NOTION_TOKEN` | Writes default false |
| Gmail | OAuth client ID, secret and refresh token | Writes default false |
| NallPuter | `NALLPUTER_URL` | Writes and command execution default false; token currently optional in adapter |
| Voice | `VOICE_ENABLED=true`, Deepgram key, ElevenLabs key and voice ID | Disabled by default; FFmpeg required |
| Academic PDF ingestion | Telegram document update and Poppler | Upload limit defaults to 20,000,000 bytes |

Use [.env.example](../.env.example) as the variable template and [src/config.ts](../src/config.ts) as the validation/default source. If this guide and the schema disagree, update the documentation from the schema rather than guessing.

## Approval operations

Mutations across file I/O, memory, schedules, workflows, Calendar, GitHub, Notion, Gmail and NallPuter use the universal Telegram approval flow.

- **Deny:** records the pending operation as denied.
- **Allow:** executes the pending operation once.
- **Always Allow:** stores a provider/operation-scoped grant in Neon and executes the pending operation.
- Approval callbacks verify the Telegram user who owns the pending record.
- Provider write flags remain separate gates. For example, an Always Allow grant does not override `GITHUB_ALLOW_WRITES=false` or missing connector credentials.
- NallPuter command execution additionally requires `NALLPUTER_ALLOW_COMMANDS=true`.

Always Allow grants are durable. Review the product's intended grant scope carefully before using it. To revoke a grant, use the supported database/admin procedure for the deployment; do not manually edit production rows without a backup and a reviewed migration.

## NallPuter deployment warning

The current NallPuter adapter enables the connector when `NALLPUTER_URL` is present and does not require `NALLPUTER_TOKEN` to be set. This is a known integration boundary in the current branch. Do not point it at a public unauthenticated computer kernel. Restrict network access and enforce authentication at the NallPuter service boundary before enabling it for untrusted users.

## Health and diagnostics

- **Public process health:** `GET /health` on the Node service.
- **Internal LightRAG health:** `GET http://127.0.0.1:9621/health` from inside the container.
- **Telegram webhook:** configured `WEBHOOK_URL` plus the private webhook path; the secret-token header is validated.
- **Memory diagnostic:** `/memorycheck` runs an isolated temporary write/read/delete check.
- **Reranker diagnostic:** `/rerankbench` measures the configured NVIDIA reranker endpoint.
- **Render logs:** use for startup, webhook, database, model, connector and worker failures.

The public health endpoint confirms that the Node HTTP server responds. It does **not** establish readiness of Neon, NVIDIA, LightRAG, Creepy Crawley, Tavily, Google, GitHub, Notion, Gmail or NallPuter.

## Validation commands

Run from the repository root:

```bash
npm run typecheck
npm test
npm run build
npm run check
python -m compileall -q memory-service
```

`npm run check` runs typecheck, automated tests and the production build. The Neon integration test is opt-in:

```bash
NALLY_DATABASE_INTEGRATION_URL="..." npm run test:integration
```

Do not report a command as passing unless it was executed against the target commit and its exit status was checked.

## Release smoke tests

1. Verify a private Telegram conversation and a group-chat participant-isolation case.
2. Test ordinary conversation and a short follow-up; confirm they do not invoke unnecessary planning.
3. Test a multi-step request and inspect bounded plan/execution behavior.
4. Exercise affect tests for stress, confusion, topic change and baseline no-hint behavior.
5. Test one read-only operation and one write operation for each configured connector.
6. Verify Deny, Allow once and Always Allow, including that another Telegram user cannot resolve the pending approval.
7. Verify provider write flags and missing credentials fail closed.
8. Test hybrid web search with both providers, then test each single-provider mode.
9. Verify voice transcription and spoken/text splitting only when voice is enabled.
10. Ingest a labeled PDF; verify extraction status and only mark it indexed after LightRAG confirms insertion.
11. Verify reminder delivery, timezone handling and recurring workflow policy.
12. Verify workspace isolation, traversal rejection and symlink protection.
13. Confirm long Telegram messages, rich-message fallback and progress editing.
14. Inspect logs for secrets and unnecessary personal data.

## Recovery

When a deploy fails, identify the first failing build or startup stage before changing dependencies. Preserve the previous healthy deployment until the new image passes startup, health and Telegram smoke tests. If a connector fails, disable that connector or remove its endpoint/credentials rather than claiming it is available. Do not replay an ambiguous mutation automatically; inspect the provider state first.

## Current operational caveats

- Local user files are not durable on an ephemeral container filesystem; mount a persistent disk if required.
- LightRAG is optional and disabled by default.
- Voice and provider connectors require external credentials and service availability.
- NallPuter authentication is not enforced by a required token in the current adapter; protect the remote service at the network/service boundary.
- `npm run check` and production provider smoke tests must be run on the current commit before release; documentation alone is not validation.
