# NallyHermes Android

A native Android client for NallyHermes, written in Kotlin and Jetpack Compose. The app is designed to use the existing Render-hosted agent; it does not embed model or provider credentials and does not create a second agent runtime.

## Current client

- Native Compose chat-first interface with Chat, History, and Settings tabs.
- Light/dark system theme support.
- Visible connection-state and offline/error messaging.
- Local UI state only; this client does not claim to send or persist chat messages.

## Backend integration status

The `v3.1-Emotions` Render service currently exposes `/health` and the Telegram webhook route. It does not yet expose a protected native chat/auth API. The Android app therefore cannot send messages or load Telegram conversation history until the backend adds authentication and native chat endpoints. Do not place Telegram bot tokens, Render secrets, or model-provider keys in the APK.

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
