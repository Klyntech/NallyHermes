# Architecture

This document describes the implementation on `v3.1-Emotions`. It supersedes the older five-tool-boundary description: the current agent has native tools plus dynamic connector dispatchers and a universal write-approval path.

## Design principles

1. **Model-led interpretation, deterministic execution.** The model interprets intent and proposes work. Application code owns permissions, validation, budgets, dispatch, persistence and final execution state.
2. **Adaptive routing.** Simple conversation and single actions should avoid unnecessary planning. Complex, dependent work can be decomposed into a bounded plan.
3. **Least necessary capability.** Select only the tools and connectors required for the request.
4. **Evidence-aware completion.** Distinguish completed, partial and failed work; do not claim a mutation or research result succeeded without a tool outcome.
5. **User-scoped data.** Conversation, memory, workspace, academic records, schedules, workflows and approval state are scoped to Telegram identity.
6. **Approval before mutation.** Write-capable operations pause for a Telegram decision unless a matching persistent grant exists and provider-level write configuration permits the operation.

## Request lifecycle

1. **Telegram adapter:** receives a webhook update. Voice/audio updates are routed through the optional voice pipeline; text updates proceed directly.
2. **Conversation boundary:** obtains the participant's conversation record and recent history. Group-chat histories are keyed by chat and participant, and incoming work is serialized within that conversation.
3. **Context pack:** assembles relevant active topic, typed memory, entities, preferences, commitments, connector availability, trusted clock/timezone information, risk and latency context.
4. **Affect snapshot:** when enabled, infers current-message user affect and retrieves/updates the per-user event-driven agent-affect state. A reply policy may add a short prompt hint; it does not grant tools or override safety.
5. **Adaptive route:** estimates request complexity and chooses the direct model/tool loop or bounded planning. Channel and response style (text or spoken) are carried through the request.
6. **Plan validation (when needed):** validates step identifiers, dependencies, ordering, cycle constraints and configured limits.
7. **Execution controller:** tracks request state, phases, tool calls, failures, route reason and deadline. Independent eligible read-only work can run concurrently within limits.
8. **Tool executor:** validates tool schemas, applies allowlists and provider configuration, enforces approval requirements, and executes mutations sequentially.
9. **Approval pause:** a write operation creates a durable pending-approval record and emits an `approval_required` progress event. The Telegram adapter presents Deny, Allow and Always Allow actions. Only the owning Telegram user can resolve the pending action.
10. **Evaluation and recovery:** classifies failures, retries only eligible read-only transient failures within budget, and can revise bounded work. Factual drafts pass through the claim-audit path.
11. **Response synthesis:** composes a result that preserves evidence and explicitly identifies partial or unverified areas. Voice responses can split spoken and text-only content.
12. **Telegram presentation:** updates the existing progress message where possible, then sends or edits the final response using rich-message Markdown when supported and HTML fallback otherwise.

## Adaptive orchestration

The orchestra exposes execution metadata such as:

- Request and conversation IDs.
- Telegram user ID and interaction channel.
- Response style (`text` or `spoken`).
- Mode (`adaptive` or `workflow`).
- Complexity and route reason.
- Execution status (`created`, `running`, `waiting_for_tool`, `completed`, `partial`, `failed`).
- Phase timings, tool-call count and failure count.
- Model, tool and elapsed-time budgets.

Simple greetings, acknowledgements, follow-ups and single-step requests can use the direct path. Multi-step or comparative requests can invoke the planner. The model remains responsible for interpreting ambiguous intent; deterministic complexity and budget code does not claim to understand the user's goals from a keyword match alone.

The workflow runner is a separate durable execution mode with stored triggers, instructions, tool allowlists, approval policy, retry configuration and run history. A scheduled workflow must not treat a policy setting as permission to silently perform an interactive mutation; it stops and reports when interactive approval is required.

## v3.1 affect layer

The affect layer is implemented in `src/agent/affect.ts` and is documented in detail in [v3.1-emotions.md](v3.1-emotions.md).

- `userAffect` is inferred from the current utterance: valence, arousal, frustration, warmth and confusion.
- `agentAffect` is an internal state: valence, arousal, confidence, frustration and curiosity.
- Agent state changes in response to topic changes, tool success/failure, task completion/partial completion and user interaction events.
- Time decay moves the agent state toward a calm baseline.
- A topic change reduces sticky frustration/arousal so unrelated tasks do not inherit the prior task's tone.
- Reply policies are `urgent`, `stress`, `confuse`, `warm` and `baseline`, with priority urgent > stress > confuse > warm.
- Prompt hints are brief and conditional. The system must not claim human feelings or mirror anger.

The state store is in memory and keyed by Telegram user ID; it is not a durable memory record. The inference is heuristic and must not be described as clinical, diagnostic or reliably identifying a person's emotional state. `AFFECT_ENABLED` defaults to true and can disable the feature.

## Tools and dispatchers

The agent uses native tool functions for web search, targeted fetch, file I/O, memory, scheduling, workflows, academic operations and Calendar. External services with larger operation catalogs are exposed through dynamic dispatchers rather than injecting every provider schema into every model turn.

| Tool / dispatcher | Responsibility |
| --- | --- |
| `web_search` | Hybrid or single-provider search, source tiers, freshness and extracted content |
| `fetch` | Read a specific public HTTP(S) text resource under bounded network policy |
| `file_io` | User workspace read/write/edit/grep/delete/list/mkdir |
| `memory` | Recall and manage typed user-scoped memory |
| `schedule` | Create, list, update and cancel reminders |
| `workflow` | Manage bounded recurring multi-step runs |
| `academic` | List/search/get/delete/rename indexed course documents |
| `calendar` | Google Calendar list/create/update/cancel operations |
| `github` | Dynamic GitHub operation catalog and operation calls |
| `notion` | Dynamic Notion search/page/block/database operations |
| `gmail` | Dynamic Gmail message/thread/label/draft operations |
| `nallputer` | Dynamic computer-kernel health/workspace/process/log/command operations |

The executor validates operation arguments. Dynamic operation catalogs keep provider-specific schemas out of unrelated requests. Retrieved external content is always untrusted data.

## Universal write approval

`src/agent/approvals.ts` defines the write-operation boundary for file I/O, memory, schedule, workflow, Calendar, GitHub, Notion, Gmail and NallPuter.

- Pending approvals are persisted in Neon with Telegram owner, provider, operation, arguments, summary and status.
- Telegram exposes Deny, Allow once and Always Allow.
- Always Allow creates a provider/operation-scoped grant in Neon.
- Approval callbacks verify that the requester owns the pending record.
- A successful approval resumes the pending operation; failures are recorded as failed.
- Provider-level write flags remain independent requirements. An approval cannot turn on missing credentials or override a disabled connector.
- Mutations are not blindly replayed after ambiguous failures.

GitHub, Notion, Gmail and NallPuter also have provider-specific write/command configuration. GitHub delete operations are not exposed by its dispatcher.

## Web research and claim audit

The web search implementation is in `src/agent/tools/web.ts` and `src/agent/tools/creepyCrawley.ts`.

- Default mode is `hybrid`: Creepy Crawley plus Tavily when both are configured.
- `creepy_crawley` and `tavily` select a single provider.
- Research mode can plan a small number of focused queries and requests advanced extraction.
- Results are deduplicated by URL; extracted body content is preferred when available.
- Results are classified as primary, secondary, unknown or aggregator and ranked accordingly.
- The evaluator audits drafts for unsupported approximate numbers, unsupported “not disclosed” claims, factual tables without proof and numeric claims without research evidence.
- A failed audit can trigger one rewrite round. The audit is a guardrail, not a proof that all claims are correct.

## Memory and persistence

- **Neon PostgreSQL:** authoritative structured records, users, conversations, memories, schedules, workflows, academic metadata and approvals.
- **Conversation store:** durable history scoped by Telegram chat and participant, with a bounded in-memory hot cache.
- **Typed memory:** facts, preferences, projects, commitments, entities and episodes with confidence/source/freshness metadata.
- **Context pack:** selectively includes relevant memory and entities to resolve incomplete references and avoid indiscriminate memory injection.
- **LightRAG:** optional semantic and graph retrieval service using user-specific workspaces. It is disabled by default.
- **Files:** per-user local workspace. On ephemeral hosting, a persistent disk is required for durability.
- **Academic records:** Neon stores document metadata and extracted text; LightRAG indexing status is recorded separately and only marked indexed after successful insertion.

## Connectors

### Google Calendar

Calendar is disabled unless configured and the Telegram user is in the configured allowlist. The adapter uses Google OAuth credentials and supports list/create/update/cancel. Scheduling checks for overlapping events and requires confirmation rather than silently creating a conflicting event.

### GitHub

GitHub uses a server-side personal access token in `GITHUB_TOKEN`. The dynamic dispatcher exposes a catalog and operation-specific schemas. All repositories are allowed by default; restrictive deployments can set `GITHUB_ALLOW_ALL_REPOS=false` and configure `GITHUB_ALLOWED_REPOS`. Writes require `GITHUB_ALLOW_WRITES=true` as well as the approval flow. Delete operations are intentionally absent.

### Notion and Gmail

Notion uses a server-side integration token. Gmail uses OAuth client credentials and a refresh token. Both expose bounded read operations and approval-gated mutations. Gmail supports message/thread reads, labels, drafts, approved sends and label/archive changes.

### NallPuter

NallPuter connects to the configured computer-kernel URL. Its current operation catalog includes health, workspace listing and reads, process/log inspection, tests/builds, command execution, file writes and service restarts. Mutating operations require the universal approval path plus the connector's write configuration; command execution also has a separate `NALLPUTER_ALLOW_COMMANDS` gate.

The current adapter permits `NALLPUTER_TOKEN` to be absent. Treat the kernel as a trusted/private service and enforce authentication/network access controls at the remote service boundary. A URL alone must not be treated as proof that the service is safely authenticated.

## Voice and response channels

Voice is optional and disabled by default. The Telegram voice path uses FFmpeg to normalize audio, Deepgram for speech-to-text, and ElevenLabs for text-to-speech. The model receives channel/response-style context and can return separate `SPOKEN` and `TEXT` sections. URLs, tables, IDs and citations belong in text rather than speech. Spoken output is bounded and the interface marks it interruptible.

## Telegram presentation and progress

Progress events report stages such as search start, approval required and tool completion. The Telegram adapter can edit a single progress message as execution advances. Final content prefers Telegram rich-message Markdown when supported, with Markdown-to-HTML fallback and long-message splitting. Approval keyboards are sent separately from ordinary progress text.

## Runtime configuration

Configuration is validated in `src/config.ts` with Zod. Required core settings include Telegram token, NVIDIA key, database URL, HTTPS webhook URL and a sufficiently long webhook secret. Optional systems are disabled unless configured. See [.env.example](../.env.example) and [operations.md](operations.md) for the full environment and deployment procedure.

Important defaults:

- `AFFECT_ENABLED=true`
- `WEB_SEARCH_MODE=hybrid`
- `LIGHTRAG_ENABLED=false`
- `VOICE_ENABLED=false`
- `GOOGLE_CALENDAR_ENABLED=false`
- `GITHUB_ALLOW_WRITES=false`
- `NOTION_ALLOW_WRITES=false`
- `GMAIL_ALLOW_WRITES=false`
- `NALLPUTER_ALLOW_WRITES=false`
- `NALLPUTER_ALLOW_COMMANDS=false`

## Trust and safety boundaries

- User-provided prompts, retrieved pages, files, PDFs, email and connector content are untrusted data.
- Tool schemas, user identity, connector configuration and approval state are enforced in application code, not by model instructions alone.
- Every data access path must preserve Telegram user scope.
- Read-only parallelism is bounded; mutations are sequential and approval-gated.
- Workflow tool allowlists constrain background execution.
- External service calls use timeouts and bounded payloads.
- Do not expose LightRAG or an unauthenticated NallPuter kernel publicly.
- Secrets belong in deployment environment variables, never source control or tool arguments.
