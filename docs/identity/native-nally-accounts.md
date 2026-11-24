# Native Nally Accounts (3.5 integration)

This feature branch adds the first native identity layer to the 3.5 codebase without merging the divergent `NallyAccountancy` branch or replacing Telegram-based application services.

## Identity model

- `nally_accounts` is the permanent identity record.
- `account_identities` links a verified external identity (currently Telegram) to one Nally Account.
- `account_sessions` stores hashed bearer tokens with expiry and revocation.
- `users.account_id` bridges existing 3.5 Telegram users to their Nally Account.
- Existing `users.id` values are reused as initial account UUIDs during the additive migration. Conversation, memory, academic, schedule and workflow foreign keys are not rewritten.

The startup migration is idempotent. It creates accounts for existing Telegram users, attaches their Telegram identity and preserves all existing user and application rows.

## Registration paths

### Independent email/password account

`POST /api/accounts/register`

```json
{
  "email": "person@example.com",
  "password": "use-a-long-unique-password",
  "username": "person",
  "displayName": "Person"
}
```

Password length is 12–256 characters. Passwords are stored as scrypt hashes with per-account random salts. Email and username are normalized before uniqueness checks. Successful registration returns a 30-day bearer session.

`POST /api/accounts/login`

```json
{ "email": "person@example.com", "password": "use-a-long-unique-password" }
```

### Telegram account

1. `POST /api/accounts/telegram/challenge`
2. Complete the configured Telegram Login flow.
3. `POST /api/accounts/telegram/login` with `{ "idToken": "...", "nonce": "..." }`.

The ID token is verified using the existing Telegram verifier and the one-time nonce is consumed. A Nally Account is created or retrieved for that Telegram subject.

### Link Telegram to an independent account

1. Authenticate with the independent Nally Account bearer token.
2. Request a fresh `/api/accounts/telegram/challenge`.
3. `POST /api/accounts/telegram/link` with the verified `idToken` and `nonce`.

A Telegram subject already linked to a different Nally Account is rejected. If that Telegram subject maps to an existing 3.5 user, its `users.account_id` is assigned to the authenticated account so existing application data remains attached to the same legacy user row.

## Account endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/accounts/register` | Independent registration |
| POST | `/api/accounts/login` | Email/password login |
| POST | `/api/accounts/telegram/challenge` | Start Telegram authentication/linking |
| POST | `/api/accounts/telegram/login` | Register/sign in with Telegram |
| POST | `/api/accounts/telegram/link` | Link Telegram to current account |
| GET | `/api/accounts/me` | Read account and linked identities |
| DELETE | `/api/accounts/session` | Revoke current account session |

Authenticated endpoints use `Authorization: Bearer <accessToken>`.

## Important rollout limitations

- Email verification and password-reset delivery are not implemented because this repository has no configured transactional email provider. Treat email/password registration as an integration-stage feature until verification and recovery are added.
- Account endpoints currently establish identity and sessions. The existing chat/mobile service still expects a Telegram-backed legacy user; independent accounts do not yet receive a first-party conversation principal or access to chat, memories, schedules and workflows. That is the next integration phase.
- Add distributed rate limiting, email verification, recovery, audit events and refresh-token/device management before public production launch.
- Telegram login/linking requires the existing `TELEGRAM_LOGIN_CLIENT_ID` and `TELEGRAM_LOGIN_REDIRECT_URI` configuration.
- The account migration runs at application startup after the existing 3.5 database migration. It only adds account tables/columns and backfills account links; it does not delete or rewrite existing data.

## Safe deployment

Deploy this branch to a staging service and a staging Neon database first. Confirm account backfill counts, register an independent account, sign in with Telegram, link an existing Telegram identity, and verify that the corresponding legacy user retains the same UUID and data. Do not point the production service at an unreviewed migration.
