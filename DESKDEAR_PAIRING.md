# DeskDear Pairing

## User flow

1. The user opens a **private chat** with Nally in Telegram.
2. The user sends `/pairdesktop`.
3. Nally creates a random ten-digit pairing code.
4. The code is stored only as an HMAC digest, expires after five minutes, and can be consumed once.
5. The user opens DeskDear and selects **Open pairing**.
6. The user enters the code from Telegram.
7. DeskDear sends the code over HTTPS to the control-plane desktop pairing endpoint.
8. The control plane atomically consumes the code and returns a short-lived desktop credential.
9. DeskDear shows the paired state and later uses the credential for the outbound device transport.

The user must not send the code in a group chat. The Telegram command must refuse non-private chats.

## v4 mechanism reused

The flow intentionally follows the existing v4 mobile pairing behavior:

- Ten numeric digits.
- Random generation using a cryptographically secure random source.
- Five-minute expiry.
- HMAC digest at rest, keyed by the Telegram bot secret.
- Atomic consume operation with an `unconsumed` and `not expired` condition.
- Failed session/device creation releases the code if it is still the same consume attempt.
- Rate limiting on pairing attempts.
- No-store response headers.
- Codes are never returned by an unauthenticated API response.

The difference is the client purpose and credential: `/pairdesktop` must create a **DeskDear device pairing**, not silently reuse a mobile app session.

## Telegram command

The v4 control-plane command should be added beside `/mobile`:

```text
/pairdesktop
```

Expected behavior:

- Ignore messages without a Telegram sender.
- Refuse group and channel chats.
- Upsert the authenticated Telegram user record.
- Create a desktop-purpose pairing code.
- Reply with the code, expiry, and a warning to keep it private.
- Do not include the code in logs or analytics.

Example response:

```text
DeskDear pairing

Your one-time code: 6749313482

Enter it in DeskDear within 5 minutes. Keep it private; it links this computer to your Nally account. The code can only be used once.
```

## Desktop API contract

The control plane should expose a separate endpoint:

```text
POST /api/desktop/pair
Content-Type: application/json
Cache-Control: no-store

{"code":"6749313482","deviceId":"...","deviceName":"..."}
```

The endpoint must:

- Reject malformed JSON and codes that are not exactly ten digits.
- Apply a bounded rate limit.
- Atomically consume only an unexpired, unconsumed desktop-purpose code.
- Bind the resulting device registration to the Telegram account and chat that requested the code.
- Return a desktop-scoped credential, not a mobile chat session token.
- Return no secret in logs or error messages.

Success response shape:

```json
{
  "paired": true,
  "deviceId": "device-id",
  "deviceToken": "short-lived-or-rotatable-credential",
  "expiresAt": "2026-11-26T19:35:00.000Z"
}
```

Failure responses should not reveal whether a particular code exists:

```json
{"error":"That pairing code is invalid, expired, or already used."}
```

## DeskDear implementation

The current Windows/Linux UI now provides:

- A pairing screen opened by **Open pairing**.
- A ten-digit numeric input.
- Local format validation before any network request.
- HTTPS-only endpoint validation.
- `POST /api/desktop/pair` submission.
- No raw pairing-code logging.
- No-store request headers.
- In-memory-only handling of the returned credential until OS-keystore persistence is implemented.
- Paired/not-paired state in the shared QML UI.

Configure the current UI test endpoint with:

```text
DESKDEAR_CONTROL_URL=https://your-control-plane.example
```

The controller appends `/api/desktop/pair`. The endpoint is intentionally not hard-coded into the binary while the NallyHermes deployment URL and device transport are still being finalized.

## Security requirements before production

- Replace in-memory credential handling with Windows Credential Manager and an appropriate Linux secret service/keystore.
- Bind the credential to the persistent device key, not merely the device ID.
- Add device name and identity to the pairing request.
- Add remote device revocation and local unpair controls.
- Do not automatically open a remote execution session after pairing.
- Require a fresh session capability grant after pairing.
- Test duplicate submissions, replay, expired codes, rate limits, process restart, clock skew, network interruption, and concurrent consumption.
- Never display the full credential after pairing.
