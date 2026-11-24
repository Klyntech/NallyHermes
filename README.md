# NallyHermes

**Branch:** `NallyAccountancy` — Nally Account data model (foundation for **Login with Nally**)

This branch introduces the first-party **Nally Account** identity system. The end goal is a polished **"Login with Nally"** experience — the same class of button as Login with Google, Apple, or Samsung.

## What landed here

| Path | Purpose |
| --- | --- |
| [`docs/identity/nally-account.md`](docs/identity/nally-account.md) | Full design: vision, handle rules, tables, migration plan |
| [`src/db/schema-accounts.ts`](src/db/schema-accounts.ts) | Drizzle schema for all account tables |

### Tables

| Table | Role |
| --- | --- |
| `nally_accounts` | Root identity (what you log into) |
| `account_identities` | Linked providers (Telegram, Google, Samsung, …) |
| `account_sessions` | Opaque sessions for first-party surfaces |
| `oauth_clients` | Registered apps that will offer "Login with Nally" |

## Public handle

Optional vanity handle, stored lowercase, presented as `@handle`.

- 3–32 characters, `[a-z0-9_]`
- Unique, case-insensitive
- Not required at account creation
- Fallback: `display_name` → email local-part → short id

## Status

**Data model only.** No live auth flows, no migration of existing Telegram users, no OIDC endpoints yet. Tables are additive and safe.

## Next steps

1. Automatic migration of existing Telegram users → Nally Accounts
2. Session issuance & validation helpers
3. First-party "Continue with Nally" on Android / web
4. Full **Login with Nally** OIDC surface

See the design doc for the complete roadmap.
