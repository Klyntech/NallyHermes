# ADR 0001: Nally v2 Platform Shape

- **Status:** Accepted as the Phase 0 working baseline
- **Date:** 2026-11-06
- **Decision owners:** Nally maintainers

## Context

Nally v1 is a working Telegram-first agent. V2 is intended to become a general-purpose agent platform while preserving v1 behavior and avoiding premature operational complexity.

## Decision

Adopt these defaults:

1. **Modular monolith:** one primary TypeScript application with explicit module boundaries. Keep infrastructure sidecars separate where runtime requirements demand it. Extract services only after measurable need.
2. **Multi-user foundations:** introduce stable internal principals and workspace scopes. Telegram identities are external identity links, not universal primary keys.
3. **Adaptive, policy-bounded autonomy:** the agent can choose among permitted actions based on task risk and policy. Model output cannot grant authority. Sensitive mutations require explicit authorization.
4. **Telegram-first, channel-neutral core:** Telegram remains the first adapter. Agent use cases must not depend on Telegram-specific types.
5. **Existing infrastructure continuity:** retain Neon PostgreSQL, NVIDIA NIM, and LightRAG as the initial infrastructure choices.
6. **Five-tool compatibility:** preserve the existing five model-visible tools unless a separately reviewed decision changes them.

## Consequences

Positive:
- Lower operational complexity than immediate microservices.
- A path to multiple interfaces and users.
- Clearer security and data ownership boundaries.
- Existing v1 components can be wrapped and evolved incrementally.

Trade-offs:
- Module boundaries require discipline inside one codebase.
- Multi-user identity requires careful schema and data migration.
- Policy enforcement and auditability add implementation work.
- Provider abstraction must be designed without overengineering.

## Revisit when

- Independent scaling or deployment becomes a measured requirement.
- Workspace/organization semantics are defined by actual product needs.
- A new provider or tool capability is approved.
- Runtime measurements show the modular monolith is a bottleneck.
