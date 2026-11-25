# Nally Account integration — implementation status

## Baseline

This integration branch is based on `Manus-Work-Full-Deplex-v3.5`. The existing `users` table remains authoritative for current Telegram application data. Its UUID primary keys and all existing foreign-key relationships are preserved.

## Included in this foundation

- Additive Nally Account, linked identity, first-party session, OAuth client/code/refresh-token, and magic-link challenge schemas.
- Idempotent `CREATE TABLE IF NOT EXISTS` / index setup in the existing Neon startup initializer.
- Combined Drizzle schema registration so the account tables are available through the existing database client.
- Opaque account session primitives that store only keyed HMAC token hashes.

## Passwordless email wiring

- `POST /api/account/magic-link` accepts JSON `{ "email": "..." }` and sends through Resend.
- `POST /api/account/verify` accepts JSON `{ "token": "..." }`, consumes the challenge once, marks the email verified, and sets an HttpOnly session cookie.
- Tokens are random, stored as SHA-256 hashes, and expire after 15 minutes.
- Responses do not disclose whether an email address has an account.
- Basic in-process request throttling is applied per email and source IP; a shared rate limiter is still needed before horizontally scaling.

Configure `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NALLY_ACCOUNT_URL`, and a dedicated `ACCOUNT_SESSION_SECRET` (at least 32 characters) in Render. Verify the sending domain in Resend and publish its required DNS records first. Use an account URL on the same site as the API until an explicit credentialed CORS policy is added.

## Not enabled yet

- No account migration/backfill runs automatically.
- No OAuth/OIDC endpoint is exposed yet.
- The same-origin `/account` page now requests and verifies sign-in links.
- No existing Telegram/mobile authentication route is changed.
- No production database migration or Render deployment is performed by this PR.

## Next implementation stages

1. Add shared/distributed rate limiting, persistent abuse controls, and operational email delivery monitoring. The initial endpoints use in-process throttling.
2. Create/link a Nally Account for an email identity without changing legacy `users.id` values.
3. Add account profile, session listing/revocation, and secure cookie handling (HttpOnly, Secure, SameSite, bounded lifetime, CSRF protections for mutations).
4. Implement OIDC discovery, authorization, PKCE S256, token exchange, refresh-token rotation/reuse detection, UserInfo, and revocation.
5. Add an explicit dry-run and separately approved idempotent Telegram-user backfill; keep legacy records and relationships intact.
6. Add tests for concurrency, token replay, expiry, email enumeration, redirect URI validation, PKCE, session revocation, and existing mobile/Telegram regression paths.

## Operational gate

Before production rollout, run the repository checks and database integration tests against a disposable Neon database. Review the additive DDL and take/verify a database recovery point before any backfill. Configure email credentials and public account URL in Render only after the provider and sender identity are confirmed.
