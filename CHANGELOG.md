# Changelog

## Unreleased — 2026-11-22

### Voice playback and wake word

- Wait for Android `AudioTrack` playback-head progress to drain queued PCM before switching the voice UI back to Listening; reject non-frame-aligned PCM write counts.
- Reduce the maximum TTS playback backlog from 1 MiB (32.768 seconds at 16 kHz mono PCM16) to 256 KiB (8.192 seconds) to limit stale audio and memory use.
- Replace direct activity launch from the background wake-word service with a user-tapped notification handoff, consistent with Android background activity launch restrictions. Resume local detection after 15 seconds if no voice call starts.
- Clarify in Settings that wake-word detection uses an on-device microphone foreground service and a persistent notification; it is not the OS-integrated Gemini/Siri-style hotword path.

### Validation limitations

- Android build and device testing remain outstanding because this environment has no Gradle wrapper, system Gradle, or Android SDK. Verify audio drain, wake notification, microphone ownership, route/focus handling, and notification-permission behavior on physical devices before release.
