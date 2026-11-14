# NallyHermes Android

Native Android client for the existing NallyHermes backend API. Telegram remains a supported interface; this app is an additional client and does not introduce a second agent runtime.

## Stack
- Kotlin
- Jetpack Compose + Material 3
- Navigation Compose
- OkHttp (transport dependency; API client implementation follows in the next milestone)

## Requirements
- Android Studio Ladybug or newer
- JDK 17
- Android SDK 35
- Gradle 8.9+

## Open and run
Open the `android/` directory in Android Studio, allow Gradle sync, then run the `app` configuration on an Android emulator or device.

Configure the backend base URL through `BuildConfig.API_BASE_URL` before wiring authentication and chat. Do not put API secrets or provider credentials in the application.

## Current scaffold
- Material 3 app theme
- Five-tab navigation shell: Chat, Tasks, Memory, Tools, Settings
- Placeholder screens for each destination
- Internet permission and cleartext traffic disabled by default

No backend endpoints are called yet. The next implementation step is to connect this client to the same authenticated API used by Telegram, beginning with session/auth and chat.
