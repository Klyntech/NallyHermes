# Nally Account — User UI

Prototype frontend for **Login with Nally** and account management.

## Run locally

```bash
# from repo root
npx serve web/account
# or open index.html in a browser (localStorage demo works offline)
```

Then open the URL shown (e.g. `http://localhost:3000`).

## Screens

| Screen | Purpose |
| --- | --- |
| **Login** | "Login with Nally" + **Continue with Telegram** (current users) |
| **Account** | Profile, `@handle`, status, entry to sub-screens |
| **Linked identities** | Telegram / Google / Samsung / Apple — mirrors `account_identities` |
| **Sessions** | List / revoke — mirrors `account_sessions` |
| **Edit profile** | Display name + handle |

## How it reflects the backend

| UI concept | Backend |
| --- | --- |
| Nally Account profile | `nally_accounts` |
| `@handle` | `nally_accounts.handle` |
| Linked providers | `account_identities` |
| Sessions list / revoke | `account_sessions` + `accountSessionStore` helpers |
| Continue with Telegram | Same path as Phase-1 migration: create account + `provider = telegram` identity |

Demo API lives in `app.js` (`MockApi`). Replace with real `fetch` to `/api/account/*` when the server endpoints exist.

## Current users path

**Continue with Telegram** simulates an existing Telegram user:

1. Looks up / creates `account_identities` row (`provider: telegram`)
2. Ensures a `nally_accounts` row exists
3. Issues an `account_sessions` row (30-day opaque session)

This is the UI counterpart of `src/db/migrate-telegram-users.ts` + `accountSessionStore.ts`.

## Design

Warm dark theme (`#0b0b0c` surfaces, amber accent). Matches the identity design docs under `docs/identity/`.
