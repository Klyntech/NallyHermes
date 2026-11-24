# Migration: Telegram users → Nally Accounts

**Branch:** `NallyAccountancy`  
**Goal:** Every existing Telegram-rooted user becomes a first-party Nally Account with a linked `telegram` identity, without breaking current Telegram or Android flows.

## Principles

- **Additive first** — create Nally Account rows; do not drop or rewrite the old `users` table in the same step.
- **Idempotent** — safe to re-run; never create duplicate accounts for the same Telegram ID.
- **Zero downtime** — Telegram webhook and mobile pairing keep working throughout.
- **Reversible in spirit** — keep `users.telegram_id` as the bridge until foreign keys are fully re-pointed.

## Current state (feature branches)

```text
users
  id (uuid)  ← referenced by memories, conversations, …
  telegram_id (unique, required)
  username, first_name, timezone, …
```

Identity is established only through Telegram.

## Target state

```text
nally_accounts          ← root identity (Login with Nally)
account_identities      ← provider = 'telegram', provider_user_id = telegram_id
users                   ← kept temporarily as a compatibility bridge
  (later: users.account_id → nally_accounts.id, or users becomes a view)
```

## Phases

### Phase 1 — Backfill (this branch / next merge)

For every row in `users` that does not yet have a matching `account_identities` row with `provider = 'telegram'`:

1. Insert `nally_accounts`:
   - `display_name` ← `users.first_name` (or username)
   - `timezone` ← `users.timezone`
   - `handle` ← null (user can claim one later)
   - `status` ← `'active'`
2. Insert `account_identities`:
   - `account_id` ← new account id
   - `provider` ← `'telegram'`
   - `provider_user_id` ← `users.telegram_id`
   - `provider_username` ← `users.username`
   - `metadata` ← `{ "legacy_user_id": "<users.id>" }`
3. Record the mapping (either in metadata or a temporary `user_account_map` table).

**Idempotency key:** `UNIQUE (provider, provider_user_id)` on `account_identities`.

### Phase 2 — Compatibility bridge

- Add nullable `users.account_id` → `nally_accounts.id`.
- Backfill it from the mapping created in Phase 1.
- New code paths prefer `account_id`; old paths keep using `users.id` until cut-over.

### Phase 3 — Re-point foreign keys

- Memories, conversations, schedules, learned_skills, etc. gain (or switch to) `account_id`.
- Dual-write or single cut-over depending on risk tolerance.
- Mobile sessions and approval tables move to `account_id`.

### Phase 4 — Deprecate Telegram-as-root

- `users.telegram_id` becomes non-authoritative (or `users` is retired).
- All identity resolution goes: Telegram ID → `account_identities` → `nally_accounts`.

## Safety checks before Phase 1 runs

- [ ] `nally_accounts` and `account_identities` tables exist
- [ ] Unique index on `(provider, provider_user_id)` is present
- [ ] Dry-run count: number of `users` vs number of rows that would be inserted
- [ ] Backup / point-in-time recovery available on Neon

## Rollback

Phase 1 is append-only. Rollback = delete the newly created `nally_accounts` / `account_identities` rows (using the `legacy_user_id` metadata or a recorded batch id). No existing Telegram data is mutated.

## Implementation note

The helper lives in `src/db/migrate-telegram-users.ts`. It is intentionally conservative and processes in batches so it can run against production Neon without long locks.
