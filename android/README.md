# NallyHermes Android

A native Android client for the existing NallyHermes agent, written in Kotlin and Jetpack Compose. The service endpoint is embedded in the app; users do not need to see or edit a Render URL. The app contains no bot token, model key, or connector credential and does not start a second agent runtime.

## Current client experience

- Native Telegram Login using Telegram's Android Login SDK, with a server-issued OIDC nonce, PKCE authorization code flow, Telegram JWKS validation, and short-lived single-use login challenges.
- A polished Telegram sign-in capsule over softly animated background glows; a private `/mobile` one-time-code path remains as a fallback until Telegram Login is configured on the server.
- Chat, Voice, and Settings in a compact floating navigation dock, with fade/slide transitions between tabs and a gently animated login-to-chat transition.
- Chat composer inspired by the provided reference, with Lucide controls and tool prompt shortcuts; typography, olive palette, and blurred portrait backdrop are preserved.
- Shared ordered text conversation: Telegram and Android messages appear in both places. Android-originated messages and replies are echoed to Telegram with source labels.
- Live server-reported thinking/tool activity through HTTPS polling. Mutating actions still require Telegram approval; the app never grants approval by itself.
- Device session token stored in private app preferences; the server stores only a keyed HMAC. **Unlink this device** revokes its session.
- GitHub, Notion, and Gmail SVG source marks converted to native Android vector drawables. The Simple Icons SVGs are CC0; brand marks remain their owners' property.

The Telegram Login SDK source in `app/src/main/java/org/telegram/login/` is based on [TelegramMessenger/telegram-login-android](https://github.com/TelegramMessenger/telegram-login-android), distributed under the MIT license included at `third_party/telegram-login-android/LICENSE`; its initializer is adapted to forward the server-issued OIDC nonce. The app keeps its token exchange and UI native; the ID token is verified on the server before a session is issued.

Text sync does not yet include Telegram attachments or native voice capture. Voice remains a native-client placeholder. Live tool activity is a transient server snapshot and may reset if Render restarts mid-request.

## Telegram Login setup (required to enable the primary sign-in button)

1. In **@BotFather → Bot Settings → Login Widget**, register the Android application for the Nally bot and obtain its Telegram Login **Client ID**.
2. Register package name `com.klyntech.nallyhermes` and the SHA-256 fingerprint of the APK signing certificate. Telegram's recommended App Link has the form `https://app{appid}-login.tg.dev/tglogin`; use the exact redirect URI shown by Telegram.
3. Add these optional environment values to the Render Web Service and redeploy:
   - `TELEGRAM_LOGIN_CLIENT_ID`
   - `TELEGRAM_LOGIN_REDIRECT_URI`
4. The app requests only `profile` and `telegram:bot_access`. The server verifies the ID-token signature, issuer, audience, and one-use nonce before issuing a 30-day mobile session. The account must have started a private chat with Nally at least once so its Telegram identity exists in the agent database.

Telegram App Link validation is tied to the signing certificate. The workflow artifact includes the exact APK signer fingerprint for BotFather registration. The workflow currently produces a debug APK, whose runner-generated debug certificate may change between builds. For repeatable updates after registration, use a stable signing keystore in GitHub Actions secrets and register that certificate fingerprint; never commit a private keystore or password. Until the BotFather values are set, sign-in reports that setup is pending and **Use a one-time code instead** remains available.

## Requirements and build

- Android Studio Ladybug or newer
- JDK 17+
- Android SDK 35
- Gradle 8.9+

Open the `android/` directory in Android Studio and run the `app` configuration, or build a debug APK with:

```bash
gradle --no-daemon :app:assembleDebug
```

The output is `app/build/outputs/apk/debug/app-debug.apk`. The GitHub Actions workflow at `.github/workflows/android-apk.yml` builds a debug APK artifact.

## One-time-code fallback

1. Select **Use a one-time code instead** on the sign-in screen.
2. In your private Telegram chat with NallyHermes, send `/mobile`.
3. Enter the returned 10-digit code in the app within five minutes.
4. Return to Chat; messages sync with that Telegram conversation and Android-originated turns are clearly labeled in Telegram.

Do not share the pairing code. If a device is lost, revoke it from **Settings → Unlink this device** when possible; sessions also expire automatically after 30 days.
