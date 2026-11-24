# NallyHermes

**Branch:** `NallyAccountancy` — foundation for **Login with Nally**

This branch builds the first-party Nally Account identity system so Nally can offer a real **"Login with Nally"** experience (the same class of button as Login with Google, Apple, or Samsung).

## What landed

### Docs

| Path | Purpose |
| --- | --- |
| [`docs/identity/nally-account.md`](docs/identity/nally-account.md) | Core identity design + public handle rules |
| [`docs/identity/migration-telegram-to-nally.md`](docs/identity/migration-telegram-to-nally.md) | Phase plan to migrate existing Telegram users |
| [`docs/identity/login-with-nally.md`](docs/identity/login-with-nally.md) | OIDC / "Login with Nally" design |

### Schema (`src/db/schema-accounts.ts`)

| Table | Role |
| --- | --- |
| `nally_accounts` | Root identity (`sub` for OIDC) |
| `account_identities` | Linked providers (Telegram, Google, Samsung, …) |
| `account_sessions` | First-party opaque sessions |
| `oauth_clients` | Apps allowed to offer Login with Nally |
| `oauth_authorization_codes` | Short-lived auth codes (PKCE) |
| `oauth_refresh_tokens` | Rotating refresh tokens |

### Helpers

| Path | Purpose |
| --- | --- |
| [`src/db/migrate-telegram-users.ts`](src/db/migrate-telegram-users.ts) | Idempotent Phase-1 backfill (Telegram → Nally Account) |
| [`src/db/accountSessionStore.ts`](src/db/accountSessionStore.ts) | Create / authenticate / revoke account sessions |

## Public handle

Optional vanity handle, stored lowercase, presented as `@handle`.

- 3–32 characters, `[a-z0-9_]`
- Unique, case-insensitive
- Not required at creation
- Fallback: `display_name` → email local-part → short id

## Status

**Data model + helpers + design.**  
No live HTTP auth endpoints yet. Tables are additive and safe to merge. Migration helper is ready to wire against the real `users` table on feature branches.

## Next

1. Wire migration against production Neon on a feature branch
2. Register first-party Android client in `oauth_clients`
3. Implement `/oauth/authorize` + `/oauth/token`
4. Discovery document + consent UI
