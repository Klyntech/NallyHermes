# Nally Account

**Branch:** `NallyAccountancy`  
**Status:** Data model only (no auth flows, no migration of live Telegram users yet)

Nally Account is the first-party identity for Nally — the equivalent of an xAI account, a Google account, or a Samsung account. It is independent of any single surface (Telegram, Android, future web) and can later link multiple external providers.

## Design goals

- One durable Nally identity that owns memories, conversations, skills, schedules, and approvals.
- Telegram remains a first-class *linked* surface, not the sole root of identity.
- Clean path to email, Google, Samsung, Apple, and other providers later.
- Optional public vanity handle that feels polished and personal.

## Public handle recommendation

**Recommended form: optional vanity handle presented as `@handle`**

| Aspect | Decision |
| --- | --- |
| Storage | `handle` column — lowercase, unique, 3–32 chars, `[a-z0-9_]` |
| Presentation | Always shown with `@` prefix (`@clinton`) |
| Required? | No. Accounts can exist without a handle. |
| Uniqueness | Case-insensitive; stored normalized. |
| Fallback display | `display_name` → email local-part → short UUID prefix |
| Why this style | Familiar (Telegram, X, Discord, GitHub), short, brandable, and works well in spoken context ("message @clinton") |

Alternatives considered and rejected for v1:

- Pure UUID only — too cold for a personal AI OS.
- `nally.id/handle` short links — can be added later as a redirect layer; not required in the core model.
- Forced handles at signup — creates friction and name-squatting pressure.

## Core tables

### `nally_accounts`

The root identity.

```text
id                 uuid PK
handle             text UNIQUE NULL          -- optional vanity, lowercase
display_name       text NULL
email              text UNIQUE NULL          -- optional until verified flows exist
email_verified_at  timestamptz NULL
password_hash      text NULL                 -- null = passwordless / OAuth-only
timezone           text NOT NULL DEFAULT 'Africa/Lagos'
status             text NOT NULL DEFAULT 'active'   -- active | suspended | deleted
created_at         timestamptz NOT NULL
updated_at         timestamptz NOT NULL
```

### `account_identities`

Linked external (or first-party) identities. Many rows → one Nally Account.

```text
id                 uuid PK
account_id         uuid NOT NULL → nally_accounts.id  ON DELETE CASCADE
provider           text NOT NULL   -- telegram | google | samsung | xai | apple | email | ...
provider_user_id   text NOT NULL
provider_username  text NULL
metadata           jsonb NOT NULL DEFAULT '{}'
linked_at          timestamptz NOT NULL

UNIQUE (provider, provider_user_id)
INDEX  (account_id)
```

### Future (not in this PR)

- `account_sessions` — opaque sessions scoped to `nally_accounts.id`
- `account_recovery` / magic-link challenges
- Automatic migration that creates a `nally_accounts` row + `telegram` identity for every existing Telegram user

## Relationship to existing `users` table

On feature branches the current `users` table is Telegram-rooted (`telegram_id` is required and unique).  
This branch intentionally introduces the new tables side-by-side. A later migration will:

1. Create a `nally_accounts` row for each existing user.
2. Insert a matching `account_identities` row with `provider = 'telegram'`.
3. Re-point foreign keys (or keep a compatibility view) so memories, conversations, etc. belong to the Nally Account.

Until that migration lands, the new tables are inert and safe to merge.

## File layout on this branch

```text
docs/identity/nally-account.md     ← this document
src/db/schema-accounts.ts          ← Drizzle definitions for the two tables
```
