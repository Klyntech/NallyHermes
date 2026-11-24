# Login with Nally

**Branch:** `NallyAccountancy`  
**Status:** Design + data-model foundation (no live endpoints yet)

This document describes how Nally becomes an identity provider so other apps (and Nally's own surfaces) can offer a polished **Login with Nally** button — the same class of experience as Login with Google, Apple, or Samsung.

## Product promise

> One Nally Account.  
> Use it to sign in to Nally Android, future web, and any partner product that supports **Login with Nally**.

Public presentation of the account is the optional vanity handle (`@clinton`) plus display name.

## Protocol choice

**OpenID Connect (OIDC)** on top of OAuth 2.1 (authorization code + PKCE).

Reasons:

- Industry standard for "Login with X"
- Works for native (Android) and web clients
- Clean separation between authentication and authorization
- Easy to add more scopes later (`profile`, `email`, future agent scopes)

## High-level flow

```text
App                         Nally (IdP)                    User
 |                               |                           |
 |  1. Authorization request     |                           |
 | ----------------------------> |                           |
 |                               |  2. Authenticate user     |
 |                               |  (session / linked id)    |
 |                               | ------------------------> |
 |                               |  3. Consent (if needed)   |
 |                               | <------------------------ |
 |  4. Authorization code        |                           |
 | <---------------------------- |                           |
 |  5. Token request (PKCE)      |                           |
 | ----------------------------> |                           |
 |  6. ID token + access token   |                           |
 | <---------------------------- |                           |
```

### Endpoints (future)

| Endpoint | Purpose |
| --- | --- |
| `GET  /.well-known/openid-configuration` | Discovery |
| `GET  /oauth/authorize` | Authorization endpoint |
| `POST /oauth/token` | Token endpoint |
| `GET  /oauth/userinfo` | UserInfo (optional) |
| `POST /oauth/revoke` | Token revocation |

### Tokens

| Token | Lifetime | Contents |
| --- | --- | --- |
| Authorization code | ~5 minutes, single-use | Bound to client + PKCE challenge |
| Access token | Short (e.g. 1h) | Opaque or JWT; scoped |
| Refresh token | Long (e.g. 30–90d) | Rotating; stored as hash |
| ID token | Matches access token | JWT with `sub` = Nally Account id, `preferred_username` = handle |

`sub` is always the stable `nally_accounts.id` (UUID). It never changes even if the user updates their handle or email.

## Data model additions

Already present on this branch:

- `nally_accounts` — the subject (`sub`)
- `account_identities` — how the user proved who they are (Telegram, Google, …)
- `account_sessions` — first-party sessions used during the authorize step
- `oauth_clients` — registered applications allowed to request Login with Nally

Still needed when the endpoints are implemented:

```text
oauth_authorization_codes
  id, code_hash, client_id, account_id, redirect_uri,
  code_challenge, code_challenge_method, scopes, expires_at, consumed_at

oauth_refresh_tokens
  id, token_hash, client_id, account_id, scopes,
  expires_at, revoked_at, parent_token_id (for rotation)
```

These will be added in a follow-up when the authorize/token handlers are built.

## Client types

| Type | client_secret | Notes |
| --- | --- | --- |
| Public / native (Android) | none (PKCE required) | Primary first-party client |
| Confidential (server web) | hashed secret | Optional later |

First-party Nally Android will be registered as a public client with PKCE.

## Scopes (v1)

| Scope | Meaning |
| --- | --- |
| `openid` | Required. Issues an ID token. |
| `profile` | Handle, display name, timezone |
| `email` | Email (only if verified) |

No agent or tool scopes in v1 — those stay inside first-party sessions.

## Security constraints

- Authorization codes are single-use and short-lived.
- PKCE (`S256`) is mandatory for public clients.
- Refresh tokens rotate on use; previous token is revoked.
- Only pre-registered `redirect_uris` are accepted.
- Account must be `status = active`.
- Linked-provider login (Telegram / Google) only establishes the Nally Account session; it does not bypass consent for third-party clients.

## Relationship to existing mobile pairing

Current Android pairing (`/mobile` code or Telegram OIDC) creates a **first-party** `account_sessions` (or today's `mobile_sessions`).  
**Login with Nally** is the generalisation of that idea to any registered client via OIDC. First-party apps can keep using the simpler session endpoints; third parties use the full OIDC flow.

## Implementation order

1. Data model (done on this branch)
2. Telegram → Nally Account migration
3. Account session helpers (done)
4. Register the first-party Android client in `oauth_clients`
5. Authorization + token endpoints
6. Discovery document + UserInfo
7. Public "Login with Nally" branding and consent screen

## Out of scope for this branch

- Live HTTP handlers
- Consent UI
- Dynamic client registration
- Social login buttons beyond what already exists for Telegram
