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

### User UI

| Path | Purpose |
| --- | --- |
| [`web/account/`](web/account/) | Working prototype: Login with Nally, Continue with Telegram, profile, linked identities, sessions |

```bash
npx serve web/account
```

## Public handle

Optional vanity handle, stored lowercase, presented as `@handle`.

- 3–32 characters, `[a-z0-9_]`
- Unique, case-insensitive
- Not required at creation
- Fallback: `display_name` → email local-part → short id

## Status

**Data model + helpers + design + UI prototype.**  
No live HTTP auth endpoints yet. Tables are additive and safe to merge. UI uses a local mock that mirrors the same shapes as the backend.

## Next

1. Wire migration against production Neon on a feature branch
2. Replace MockApi with real `/api/account/*` endpoints
3. Register first-party Android client in `oauth_clients`
4. Implement `/oauth/authorize` + `/oauth/token`
