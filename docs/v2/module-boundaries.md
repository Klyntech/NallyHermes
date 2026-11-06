# Nally v2 Module Boundaries

This document defines intended ownership and dependency direction. It does not imply that every module has been implemented.

## Dependency rule

Dependencies point inward:

- Interface adapters depend on application contracts.
- Application services depend on domain contracts.
- Domain logic must not depend on Telegram, Drizzle, NVIDIA SDKs, HTTP frameworks, or LightRAG.
- Infrastructure adapters implement ports defined by the application or domain layer.
- Modules communicate through exported contracts or domain events, not by reaching into another module's private tables or internal files.

## Module catalogue

| Module | Owns | Must not own |
|---|---|---|
| Interface adapters | Telegram/web/API transport, identity mapping at channel edge, rendering | Agent planning, memory policy, domain state |
| Identity and access | Principals, external identity links, workspace membership, authorization decisions | Channel-specific message formatting |
| Sessions | Conversation/session lifecycle and history policy | Long-term knowledge graph |
| Context | Context selection, assembly, token budgeting, provenance | Tool execution or permission grants |
| Cognitive engine | Intent interpretation, planning, evaluation, stopping decisions | Direct database or provider SDK calls |
| Execution runtime | Step scheduling, budgets, concurrency, retries, normalized outcomes | Product-specific channel behavior |
| Tool capabilities | Contracts and implementations for approved capabilities | Unbounded access or self-granted permissions |
| Memory | Memory lifecycle, retrieval policy, provenance, consolidation | Treating semantic index as authoritative structured storage |
| Missions | Persistent objectives, checkpoints, dependencies, resumability | Channel-specific progress messages |
| Proactive engine | Triggers, schedules, monitoring, notification decisions | Bypassing user authorization or notification policy |
| Workspaces | Project and workspace lifecycle, scoped artifacts | Global unscoped file access |
| Model gateway | Provider-neutral request/response contract, routing policy, usage metadata | Planning policy or business authorization |
| Observability | Traces, metrics, structured operational events | Unredacted secrets or unnecessary personal data |

## Stable contracts

Contracts should be introduced when the first consumer needs them. Keep them small, typed, versioned where persistence or external compatibility requires it, and independent of infrastructure libraries.

### Principal scope

Every application command that accesses user-owned data receives an explicit scope:

- `principalId`: stable internal identity.
- `workspaceId`: optional workspace boundary.
- `requestId`: correlation identifier.
- `sessionId`: optional conversation/session reference.

Do not use a Telegram chat ID as a universal authorization principal.

### Application result

Use a normalized result envelope with:

- success/partial/failure outcome;
- typed result data;
- stable error code for expected failures;
- safe user-facing message where appropriate;
- provenance/evidence references where relevant;
- correlation identifier.

Do not leak stack traces, credentials, or provider response bodies into user-facing errors.

### Execution event

Events should carry an event ID, event type, schema version, timestamp, correlation ID, and principal/workspace scope where relevant. Payloads should contain only what consumers need.

### Model gateway

Callers request a capability or policy profile, not a hard-coded provider model name. The gateway records provider/model metadata, latency, token usage when available, and normalized failures. Routing remains deterministic and configurable.

## Data ownership and schema policy

A module owns writes to its data. Other modules use its application service or repository contract. Avoid cross-module SQL writes.

Database migrations must be additive by default:
1. Add nullable columns/tables/indexes.
2. Deploy code that can read old and new forms.
3. Backfill in bounded batches.
4. Validate counts and invariants.
5. Switch reads/writes.
6. Remove obsolete structures only in a separately reviewed migration.

All user-owned records require explicit ownership scope and indexes that support scoped queries.

## Five-tool compatibility

The current five model-visible tools remain the v2 compatibility boundary:

- `web_search`
- `fetch`
- `file_io`
- `memory`
- `schedule`

Internal services, adapters, and events do not increase the model-visible tool count. Any change requires an explicit product and security review.

## Testing boundaries

- Unit-test domain rules without network or database dependencies.
- Contract-test module ports and adapters.
- Integration-test database scoping and migrations.
- Test every interface adapter against the same application use cases.
- Test event consumers for ordering assumptions and duplicate delivery.
- Add regression tests before changing existing v1 behavior.
