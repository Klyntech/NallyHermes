# Nally Account

**Branch:** `NallyAccountancy`  
**Status:** Data model foundation (no live auth flows yet)

Nally Account is the first-party identity for the Nally ecosystem — the same class of thing as a Google account, an Apple account, a Samsung account, or an xAI account.

The public promise is simple:

> **Login with Nally**

One durable identity that owns your memories, conversations, skills, schedules, approvals, and future Nally products. Telegram, Android, web, and external apps become *surfaces* that talk to this identity, not the identity itself.

## Vision

| Today (this branch) | Near future | Longer term |
| --- | --- | --- |
| Data model only | Sessions + migration of existing Telegram users | "Login with Nally" button (OIDC/OAuth) for Nally apps and third parties |
| Optional `@handle` | Email / magic-link + linked providers | Nally as a proper identity provider |
| Additive tables | Re-point foreign keys to Nally Account | Cross-product single sign-on |

### The mental model

```text
┌─────────────────────────────────────────┐
│           Nally Account                 │
│   @clinton  ·  display name  ·  email   │
└──────────────────┬──────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
 Telegram      Google /      Future apps
 (linked)      Samsung       (Login with Nally)
```

You create a Nally Account once. Then you can:

- Continue talking to Nally on Telegram (linked identity)
- Sign into the Android app with the same account
- Eventually click **Login with Nally** on any Nally surface or partner product

## Design goals

- One durable Nally identity that owns memories, conversations, skills, schedules, and approvals.
- Telegram remains a first-class *linked* surface, not the sole root of identity.
- Clean path to email, Google, Samsung, Apple, and other providers.
- Optional public vanity handle that feels polished and personal.
- Foundation for a real **"Login with Nally"** experience (sessions now, OIDC later).

## Public handle

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

The root identity — what you actually log into.

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

### `account_sessions`

Opaque sessions for "Login with Nally" and first-party surfaces (Android, future web).

```text
id                 uuid PK
account_id         uuid NOT NULL → nally_accounts.id  ON DELETE CASCADE
token_hash         text UNIQUE NOT NULL     -- only a keyed HMAC is stored
expires_at         timestamptz NOT NULL
revoked_at         timestamptz NULL
created_at         timestamptz NOT NULL
last_seen_at       timestamptz NULL
user_agent         text NULL
ip_hint            text NULL               -- coarse, never full raw IP long-term

INDEX (account_id)
INDEX (expires_at)
```

### `oauth_clients` (foundation for Login with Nally as IdP)

Registered applications that will one day be allowed to offer **Login with Nally**.

```text
id                 uuid PK
client_id          text UNIQUE NOT NULL     -- public identifier
client_secret_hash text NULL                -- null for public/native clients
name               text NOT NULL
redirect_uris      jsonb NOT NULL DEFAULT '[]'
grant_types        jsonb NOT NULL DEFAULT '["authorization_code"]'
scopes             jsonb NOT NULL DEFAULT '["openid","profile"]'
status             text NOT NULL DEFAULT 'active'
created_at         timestamptz NOT NULL
updated_at         timestamptz NOT NULL
```

This table is deliberately minimal. Full OIDC authorization-code + token tables will arrive when the Login with Nally flow is implemented.

## Relationship to existing `users` table

On feature branches the current `users` table is Telegram-rooted (`telegram_id` is required and unique).  
This branch intentionally introduces the new tables side-by-side. A later migration will:

1. Create a `nally_accounts` row for each existing user.
2. Insert a matching `account_identities` row with `provider = 'telegram'`.
3. Re-point foreign keys (or keep a compatibility view) so memories, conversations, etc. belong to the Nally Account.
4. Optionally issue the first `account_sessions` for mobile clients.

Until that migration lands, the new tables are inert and safe to merge.

## File layout on this branch

```text
docs/identity/nally-account.md     ← this document
src/db/schema-accounts.ts          ← Drizzle definitions for all account tables
```

## Next steps (ordered)

1. ~~Data model~~ ← you are here
2. Automatic migration of existing Telegram users → Nally Accounts
3. Session issuance & validation helpers
4. First-party "Continue with Nally" on Android / web
5. Full **Login with Nally** OIDC surface for external clients
