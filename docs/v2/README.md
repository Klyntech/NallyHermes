# Nally v2 Engineering Foundation

**Status:** Phase 0 complete; Phase 1 Orchestra 2.0 implementation complete pending CI verification  
**Target:** NallyHermes v2  
**Compatibility baseline:** Nally v1 beta  
**Implementation policy:** Additive evolution; no v1 rewrite

## Vision

Nally v2 is a general-purpose agent platform with Telegram as its first interface. The agent core must not depend on Telegram-specific update, session, or presentation types. New interfaces should integrate through adapters and use the same application services.

## Architectural defaults

These are the Phase 0 working decisions. They are intentionally documented as defaults and can be revised through an Architecture Decision Record (ADR).

1. **Deployment:** modular monolith first, with explicit boundaries and independently testable modules. Keep infrastructure processes such as LightRAG separate where their runtime requires it. Extract services only when measured operational or scaling needs justify the cost.
2. **Audience:** multi-user foundations from the beginning. Every user-owned resource is scoped to a stable internal principal and, where applicable, a workspace. Telegram identity is one external identity, not the universal internal user ID.
3. **Autonomy:** adaptive, policy-bounded autonomy. Read-only work may proceed within budgets; sensitive or consequential mutations require explicit authorization according to policy. The model never grants itself permissions.
4. **Agent tools:** preserve the approved five-tool model interface unless a deliberate product decision changes it.
5. **Persistence:** Neon PostgreSQL remains the authoritative structured store. LightRAG remains a supplementary semantic/graph retrieval service.
6. **Model provider:** NVIDIA NIM remains the current provider. Provider abstraction must not delay improvements to the agent itself.

## Phase 0 documents

- [Target architecture](./architecture.md)
- [Module boundaries and contracts](./module-boundaries.md)
- [V1-to-v2 migration strategy](./migration.md)
- [Architecture decisions](./decisions/)
- [Orchestra 2.0 execution design and implementation status](./orchestra-2.0.md)
- [Full-duplex voice readiness](./voice-readiness.md)

## Delivery sequence

1. Freeze these boundaries and identify current v1 ownership.
2. Add shared domain contracts only when a concrete v2 feature needs them.
3. Complete Orchestra 2.0 behind a compatibility boundary, with hard request budgets, structured correlated events, and channel-neutral execution. (Implementation complete; CI verification pending.)
4. Introduce voice in V2.5 or V3 as an interface and speech pipeline over the same Orchestra; do not build a second agent runtime.
5. Add memory, mission, proactive, workspace, model, and interface capabilities incrementally.
6. Keep observability, security, and evaluation requirements active in every phase.

## Non-goals for Phase 0

- No rewrite of the existing controller or tool runtime.
- No microservice split.
- No new model provider.
- No new model-visible tools.
- No database migration or production data modification.
- No deployment or runtime configuration change.

## Definition of done

Phase 0 is complete when the architecture and module contracts are reviewed, the migration path is explicit, the working v1 behavior is protected by regression checks, and each later phase has measurable acceptance criteria before implementation begins.
