# Nally v1 to v2 Migration Strategy

## Guiding rule

V2 is an additive evolution of the working v1 beta. The v1 branch and its deployment remain the recovery baseline. V2 work happens on the dedicated `v2` branch until explicitly approved for integration.

## Phase 0 restrictions

Phase 0 is documentation and architecture only. It must not:

- alter production data;
- change the deployed v1 service;
- rename or remove existing tools;
- replace the current Orchestra;
- change the LightRAG storage model;
- change environment variable meanings;
- introduce a new deployment topology.

## Compatibility strategy

1. Preserve current request and response behavior while introducing internal contracts.
2. Wrap existing implementations behind adapters rather than rewriting them immediately.
3. Introduce internal principal/workspace abstractions before changing persisted identity.
4. Keep old database records readable during any migration window.
5. Use feature flags for new behavior that could affect execution or persistence.
6. Keep schema changes additive until new code has been deployed and verified.
7. Maintain a rollback path for every stateful migration.

## Identity migration

Current ownership is based on Telegram participant/chat identity. V2 should introduce a stable internal principal and external identity mapping.

Before implementing:
- inventory every table, file path, memory workspace, schedule, and cache key containing Telegram identity;
- define collision and account-linking behavior;
- create principal and external-identity tables;
- backfill in bounded, repeatable batches;
- verify every old record maps to exactly one principal;
- test cross-user isolation;
- retain old identifiers until rollback is no longer required.

Do not infer that two Telegram identities belong to the same person.

## Mission persistence

Long-running missions require durable state. Introduce mission tables without repurposing conversation history or scheduler records. Define explicit state transitions, checkpoint schema versioning, lease/worker ownership, idempotency keys, and recovery behavior before enabling background execution.

## Rollout sequence

1. Build and test new contracts without changing runtime behavior.
2. Add backward-compatible adapters around v1 services.
3. Add schema changes with no destructive operations.
4. Backfill and validate data where necessary.
5. Enable new behavior for controlled test users or a staging environment.
6. Run end-to-end tests and compare outcomes with v1.
7. Expand rollout only after acceptance criteria pass.
8. Remove compatibility code only after a separate review and rollback window.

## Rollback

- Keep v1 deployment available until v2 passes end-to-end verification.
- Do not roll back application code across an incompatible schema change; use expand/contract migrations.
- Preserve mission checkpoints and audit records during rollback.
- Document operator actions for pausing workers and preventing duplicate scheduled execution.

## Migration acceptance criteria

- No loss or reassignment of existing user data.
- Cross-user and cross-workspace isolation tests pass.
- Repeated migration execution is safe or explicitly rejected before partial changes.
- Old and new application versions behave correctly during the compatibility window.
- Rollback has been exercised in a non-production environment.
