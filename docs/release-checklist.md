# v3.1 Release Checklist

This checklist applies to the `v3.1-Emotions` development line. A branch name is not a release declaration. Do not mark an item complete until it has been checked against the release candidate.

## Repository and versioning

- [ ] Confirm the intended release version and update `package.json`, changelog and release notes together.
- [ ] Decide whether `v3.1-Emotions` is a development branch or release branch; create a release tag only after sign-off.
- [ ] Review the full Git diff and confirm no secrets, user data, tokens or generated runtime data are included.
- [ ] Confirm the npm lockfile is committed and the deployment install strategy is reproducible.
- [ ] Select and add a repository license.
- [ ] Review dependency advisories and resolve or explicitly accept high/critical findings.
- [ ] Review environment-variable documentation against `src/config.ts` and `.env.example`.

## Build and automated tests

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run check` and retain the result for the release candidate.
- [ ] Run `python -m compileall -q memory-service`.
- [ ] Run the opt-in Neon integration test against a dedicated test database.
- [ ] Confirm affect tests cover user/agent state separation, policy priority, topic decay and no-hint baseline.
- [ ] Confirm orchestration tests cover simple/direct routing, complex planning, budgets, typed failures and partial results.
- [ ] Confirm approval tests cover Deny, Allow once, Always Allow, ownership checks and provider write gates.
- [ ] Confirm connector tests cover missing credentials, bounded arguments and read/write operation classification.
- [ ] Confirm voice tests cover audio normalization boundaries, dual-channel splitting and provider failure handling.
- [ ] Confirm workspace and Telegram isolation regression tests pass.

## Affect and conversational behavior

- [ ] Verify `AFFECT_ENABLED=false` disables affect injection.
- [ ] Verify user frustration does not cause agent anger mirroring.
- [ ] Verify confusion policy favors a plain explanation and a check for understanding.
- [ ] Verify topic changes reduce carry-over frustration.
- [ ] Verify urgent policy takes precedence over stress, confusion and warmth.
- [ ] Verify affect remains a soft hint and cannot change permissions, safety rules or tool budgets.
- [ ] Verify the user-facing assistant does not claim human feelings or present heuristic affect inference as diagnosis.

## Approval and connector safety

- [ ] Verify each configured write-capable tool pauses for approval unless a matching persisted grant exists.
- [ ] Verify approval callbacks only accept the Telegram user who owns the pending record.
- [ ] Verify Always Allow is scoped to the intended provider/operation.
- [ ] Verify provider write flags remain required even when an approval grant exists.
- [ ] Verify GitHub writes are disabled unless explicitly configured; confirm delete operations remain unavailable.
- [ ] Verify Notion and Gmail credentials are server-side only and writes are separately gated.
- [ ] Verify Google Calendar is restricted to the configured Telegram user allowlist.
- [ ] Verify NallPuter URL, authentication, network access and command restrictions. Do not expose an unauthenticated kernel publicly.
- [ ] Verify workflow allowlists cannot expand during a scheduled run and background work cannot silently approve interactive mutations.

## Runtime and integration validation

- [ ] Telegram private-chat smoke test.
- [ ] Group-chat participant-isolation test.
- [ ] Conversation persistence and follow-up continuity test.
- [ ] Simple request bypasses planner; complex request uses a validated bounded plan.
- [ ] Independent eligible reads run concurrently; mutations remain sequential.
- [ ] Partial and failed work is reported honestly.
- [ ] Memory recall remains user-scoped and relevant.
- [ ] LightRAG indexing, retrieval, reranking and fallback behavior are verified when enabled.
- [ ] PDF extraction handles normal, large and scanned/image-only documents with accurate status reporting.
- [ ] One-time and recurring reminders deliver at the intended local time.
- [ ] Event-triggered monitoring requests are not silently converted into guessed clock-time reminders.
- [ ] Hybrid search is tested with both providers and each single-provider mode.
- [ ] Voice STT/TTS is tested when enabled.
- [ ] Telegram progress editing, approval keyboards, rich-message fallback and long-message splitting work.
- [ ] Workspace traversal and symlink protections pass.

## Deployment and operations

- [ ] Render Docker build and startup pass on Node 22.
- [ ] Poppler and FFmpeg are present in the deployed image.
- [ ] Public health endpoint responds after startup; dependency readiness is checked separately.
- [ ] Webhook HTTPS and secret-token validation are confirmed.
- [ ] LightRAG remains private and starts only when enabled.
- [ ] Persistent disk is configured if local user files must survive deploys.
- [ ] Database backup and recovery expectations are documented.
- [ ] Logs do not expose tokens, secrets or unnecessary personal content.
- [ ] Rollback to the previous deployment is available.
- [ ] Provider-specific smoke tests pass for every connector advertised as enabled.

## Known release caveats to resolve or accept

- Affect state is in-memory and resets on process restart.
- Affect inference is heuristic and must not be described as clinical assessment.
- NallPuter's current adapter permits an absent token; service/network authentication must be enforced externally.
- The repository currently has no selected license.
- The current development branch's package metadata is still `2.2.0-alpha.1`; release versioning has not yet been aligned to v3.1.

Do not call v3.1 stable while required build, security, approval, connector, data-isolation or deployment checks remain unverified.
