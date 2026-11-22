# Changelog

## Unreleased — 2026-11-22

### Voice playback and wake word

- Wait for Android `AudioTrack` playback-head progress to drain queued PCM before switching the voice UI back to Listening; reject non-frame-aligned PCM write counts.
- Return from Thinking to Listening when a server turn ends without spoken audio; add privacy-safe PCM, AudioTrack write/drain, route, volume and WebSocket-close diagnostics.
- Reduce the maximum TTS playback backlog from 1 MiB (32.768 seconds at 16 kHz mono PCM16) to 256 KiB (8.192 seconds) to limit stale audio and memory use.
- Replace direct activity launch from the background wake-word service with a user-tapped notification handoff, consistent with Android background activity launch restrictions. Resume local detection after 15 seconds if no voice call starts.
- Clarify in Settings that wake-word detection uses an on-device microphone foreground service and a persistent notification; it is not the OS-integrated Gemini/Siri-style hotword path.
- Request microphone and Android 13+ notification permissions when the user enables wake word; display the active model phrase truthfully. Load `hey_nally.onnx` from app assets when present, with explicit Hey Jarvis fallback until then.
- Add a Hey Nally training workspace with an upstream-aligned starter config, valid manifest template, ignored local dataset/artifact directories and an audit script for WAV format, manifest integrity, speaker leakage and sample/hour thresholds. No custom model is claimed or packaged; no dataset is present and no training has run.
- Document source revisions and compatibility caveats for upstream openWakeWord training, required positive/negative/background data, isolated runtime, reproducibility records and held-out model/device validation.

### Validation limitations

- Android build and device testing remain outstanding because this environment has no Gradle wrapper, system Gradle, or Android SDK. Verify audio drain, wake notification, microphone ownership, route/focus handling, and notification-permission behavior on physical devices before release.
