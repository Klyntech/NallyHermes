# v1 Release Checklist

Use this checklist before promoting the beta to a stable v1 release.

## Repository and build

- [ ] Commit and review `package-lock.json`; use `npm ci` in CI and Docker.
- [ ] CI passes typecheck, unit tests, build and Python syntax checks.
- [ ] Expand automated tests to cover planner validation, executor permissions, scheduling, memory isolation and webhook handling.
- [ ] Review all dependency advisories and resolve or explicitly accept each high/critical finding.
- [ ] Pin validated DNS addresses for outbound fetch connections to close DNS-rebinding gaps.
- [ ] Select and add the repository license.
- [ ] Confirm version, changelog and release notes.

## Runtime validation

- [ ] Telegram private-chat smoke test.
- [ ] Group-chat participant isolation test.
- [ ] Natural conversation and follow-up tests.
- [ ] Simple request bypasses planning; complex request creates a valid plan.
- [ ] Independent read-only calls run concurrently; mutations remain sequential.
- [ ] Failed and partial work is reported honestly.
- [ ] Memory recall is model-directed and never crosses user boundaries.
- [ ] LightRAG indexing, retrieval, reranking and fallback behavior are verified.
- [ ] One-time and recurring reminders deliver at the intended local time.
- [ ] Workspace traversal and symlink protections pass.
- [ ] Progress editing and Telegram message splitting work for long responses.

## Deployment and operations

- [ ] Render Docker build and startup pass.
- [ ] Health endpoint responds after startup.
- [ ] Webhook secret validation is confirmed.
- [ ] Persistent disk is configured if user files must survive deploys.
- [ ] Database backups and recovery expectations are documented.
- [ ] Logs do not expose tokens, secrets or unnecessary personal content.
- [ ] Rollback to the previous deployment is available.

## Stable release blockers

Do not mark stable v1 ready while the lockfile, license, dependency review or required runtime integration tests remain unresolved.
