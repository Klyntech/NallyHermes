# NallyHermes Android

A native Android client for NallyHermes, written in Kotlin and Jetpack Compose. The client is intended to use the existing Render-hosted agent; it does not embed provider or model credentials and does not create a second agent runtime.

## Current client

- Chat, Voice, and Settings destinations in a compact floating navigation bar.
- A two-row message composer inspired by the supplied reference, with prompt-tool shortcuts and Lucide controls.
- Rounded, Claude-inspired user-message treatment while preserving the existing typography, olive palette, and blurred portrait backdrop.
- A reusable, animated activity card designed to render real thinking and tool-progress events when a native progress stream is available. It is deliberately not driven by simulated activity.
- GitHub, Notion, and Gmail SVG source marks, converted to native Android vector drawables for crisp display. The source SVGs are from Simple Icons, licensed CC0; brand names and marks remain the property of their respective owners.
- Local UI state only; this client does not currently send or persist chat messages.

## Backend integration status

The V3.1 agent already emits thinking and tool-progress events for Telegram, including GitHub, Notion, Gmail, web search, calendar, memory, files, and other tools. Those events currently do not reach a native Android client. The Render service still needs a protected native chat/auth API and a streaming or event endpoint for the app to send requests, receive replies, and display live activity. Voice also needs a native endpoint and microphone-permission flow. The UI does not claim that a request or tool action is running when no server event has been received. Do not place Telegram bot tokens, Render secrets, or model-provider keys in the APK.

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
