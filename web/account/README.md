# Nally Account UI

This UI is served by the 3.5 application at `/account`.

## What it currently supports

- Email/password registration against `POST /api/accounts/register`
- Email/password login against `POST /api/accounts/login`
- Authenticated account profile at `GET /api/accounts/me`
- Session revocation on sign out via `DELETE /api/accounts/session`
- Telegram login and linking through the existing OIDC challenge endpoints

The bearer token is held in tab-scoped `sessionStorage`; it is not written to local storage.

## Telegram setup

Configure `TELEGRAM_LOGIN_CLIENT_ID` and `TELEGRAM_LOGIN_REDIRECT_URI` in the service environment. The redirect URI registered with Telegram must exactly match the public account page URL, normally `https://YOUR_HOST/account`. Telegram OIDC must return an ID token in the URL fragment for this browser flow.

## Important limitations

- Email verification and password recovery are not implemented.
- The backend does not yet expose profile editing or session listing/revocation per device.
- The account APIs are not yet wired as the owner of the existing chat, memory, schedule, and workflow data.
- Test with a staging database before production use.

The original NallyAccountancy UI was a localStorage-backed prototype. This port keeps its dark/amber visual direction but replaces the mock account store with the real 3.5 account APIs.
