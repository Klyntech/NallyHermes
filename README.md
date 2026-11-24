# NallyHermes

**Branch:** `NallyAccountancy` — Nally Account data model (identity foundation)

This branch introduces the first-party **Nally Account** schema. It is deliberately additive and does not yet wire authentication or migrate existing Telegram users.

## What landed here

| Path | Purpose |
| --- | --- |
| [`docs/identity/nally-account.md`](docs/identity/nally-account.md) | Design rationale, handle recommendation, table overview |
| [`src/db/schema-accounts.ts`](src/db/schema-accounts.ts) | Drizzle definitions for `nally_accounts` + `account_identities` |

## Public handle

Optional vanity handle, stored lowercase, presented as `@handle`.

- 3–32 characters, `[a-z0-9_]`
- Unique, case-insensitive
- Not required at account creation
- Fallback display order: `display_name` → email local-part → short id

This style is familiar (Telegram / X / Discord / GitHub) and works well in both text and spoken context.

## Next steps (not on this branch)

1. Migration that creates a Nally Account + `telegram` identity for every existing user.
2. Session table scoped to `nally_accounts.id`.
3. Auth surfaces (email magic link, Google / Samsung linking, etc.).
4. Re-point foreign keys so memories, conversations, skills, and approvals belong to the Nally Account.

See the design doc for full details.
