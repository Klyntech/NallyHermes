# NallyHermes Android

A native Android client for the existing NallyHermes Render agent, written in Kotlin and Jetpack Compose. It connects to `https://nally.onrender.com` by default; the base URL remains editable in Settings. The app does not embed Telegram bot tokens, model keys, or connector credentials and does not create a second agent runtime.

## What works in this client

- Chat, Voice, and Settings destinations in a compact floating navigation bar.
- A two-row composer with Lucide controls and prompt-tool shortcuts, preserving the established typography, olive palette, and blurred portrait backdrop.
- Secure account pairing: send `/mobile` in your **private Telegram chat** with NallyHermes, then enter its one-time 10-digit code in Android Settings. The code expires after five minutes and can be used once.
- Shared ordered text conversation: ordinary text messages from Telegram and Android appear in both places. Android-originated messages and their agent replies are echoed to Telegram with source labels.
- Live server-reported thinking/tool activity through HTTPS polling. Mutating actions still require Telegram approval; the app never grants approval by itself.
- Local app session token stored in private app preferences; the server stores only its keyed HMAC. Unlinking revokes the session.
- GitHub, Notion, and Gmail SVG source marks, converted to native Android vector drawables for crisp display. The source SVGs are from Simple Icons, licensed CC0; brand names and marks remain the property of their respective owners.

The current text sync does not include Telegram attachments or native voice capture. Voice UI remains a setup placeholder. Tool activity is a transient server snapshot and may reset if the service restarts while a request is running. Telegram Login is not part of this pairing build: the private `/mobile` code is the supported account-link path for now.

## Requirements

- Android Studio Ladybug or newer
- JDK 17
- Android SDK 35
- Gradle 8.9+

## Build

Open the `android/` directory in Android Studio and run the `app` configuration, or build a debug APK with:

```bash
gradle --no-daemon :app:assembleDebug
```

The output is `app/build/outputs/apk/debug/app-debug.apk`. The GitHub Actions workflow at `.github/workflows/android-apk.yml` builds a debug APK artifact.

## Pairing

1. Install the APK and open **Settings**.
2. In your private Telegram chat with NallyHermes, send `/mobile`.
3. Enter the one-time code in the app within five minutes and tap **Connect Telegram**.
4. Return to Chat. Text messages sync with that Telegram conversation; Android messages and replies are labeled in Telegram.

Do not share the pairing code. If a device is lost, use **Unlink this device** when possible; the session expires automatically after 30 days.
