# Native voice architecture and engineering review

## Current implementation

The Android app and backend remain on separate branches: `android-native-app` contains the Kotlin/Compose client, while `Manus-Work-Full-Deplex-v3.5` contains the Node.js/TypeScript voice gateway. The client exchanges its authenticated bearer session for a 60-second single-use ticket, connects to `/api/mobile/voice`, and sends mono signed PCM16 little-endian at 16 kHz as binary WebSocket frames. The server opens Deepgram streaming transcription, sends finalized utterances through the existing Nally `respond` pipeline, and streams ElevenLabs PCM chunks back to Android. Provider credentials stay server-side.

The transport is duplex: microphone capture stays active during speech playback, and onset/interim speech can interrupt the active TTS and abort cancellable response generation. The assistant model still returns a complete answer before TTS starts, so this is not incremental model-token-to-speech generation. That latency boundary remains a separate architectural milestone.

The Android client sends 3,200-byte microphone frames, equivalent to 100 ms at 32,000 bytes/second. The server accepts at most 32,000 bytes per audio frame, equivalent to one second. Android's upload queue watermarks are 16 KiB and 64 KiB, or 0.5 and 2 seconds of this stream; only a sustained 5-second high-water stall is treated as an upload failure. Deepgram uses raw `linear16`, `sample_rate=16000`, interim results and 300 ms endpointing. Deepgram distinguishes finalized segments (`is_final`) from the utterance boundary (`speech_final`), so the client accumulates final segments before dispatching the completed utterance [1] [2]. The 300 ms endpoint is the low end of Deepgram's 300–500 ms recommendation for conversations with mid-thought pauses; the default 10 ms setting would be too eager for many conversational turns [2] [3].

## Review fixes applied

Android `AudioTrack.write()` queues PCM; a successful write does not mean the listener has heard those samples. Previously the client returned to Listening when it consumed the `audio_end` queue marker, even if audio remained in the hardware playback queue. The playback worker now waits for the unsigned playback-head frame count to reach the number of frames written before announcing Listening. It also rejects non-frame-aligned write counts. This prevents the UI and microphone-turn state from getting ahead of audible playback [4].

The playback backlog was capped at 1 MiB. At 32,000 bytes/second, that is 32.768 seconds of queued speech. It is now 256 KiB, or 8.192 seconds, retaining burst headroom while reducing the worst-case queued PCM memory by 75%. A single 32,000-byte server frame is about one second of audio. If the queue still exceeds the cap, the client fails the session rather than growing without bound. These are guardrails, not measured latency targets.

The wake-word service previously tried to call `startActivity()` directly when a phrase was detected. Android restricts background activity launches, and a foreground service by itself is not a general exemption. The service now posts a notification with a tap-to-open `PendingIntent`, then resumes detection after 15 seconds if a voice call has not started [5].

The ElevenLabs stream-input path must use `flush: true` on the final non-empty text message to force the buffered final text into audio. An empty string closes the WebSocket; it is not a flush message. This endpoint does not support the `eleven_v3` or `eleven_v4` models [6]. The backend's final-text helper follows that contract.

## Wake word: what Android permits

The current implementation uses the openWakeWord Android library locally and a microphone foreground service. It does not stream wake-word audio to the backend. The service is user-enabled, displays a persistent microphone notification, and is paused while the full-duplex call owns the microphone. This is the supported general-app route for ongoing microphone capture: declare the microphone foreground-service type and permissions, obtain `RECORD_AUDIO`, and start while the app is eligible. Android 12+ restricts starting foreground services from the background; Android 14+ also enforces while-in-use microphone permission at service creation [7] [8].

A normal app cannot make continuous background microphone listening disappear simply by omitting the foreground service. The Android system-integrated route is different: the currently user-selected `VoiceInteractionService` is kept running by Android for hotwording. Android's role documentation makes assistant-role availability and user consent explicit. AOSP's voice-interaction architecture routes hotword management through system services and `AlwaysOnHotwordDetector`; DSP detection is optional and depends on device/OEM support [9] [10] [11]. Building Nally as a default assistant would therefore require a real voice-interaction implementation, role request/selection, compatible session behavior and device testing. It is not a manifest-only switch, nor can an ordinary app assume access to the system's low-power hotword DSP.

The platform comparisons are not equivalent product architectures. Gemini can use the Google app as Android's default assist app; “Hey Google” requires Voice Match and the device must support the feature [12]. Siri is an iOS-integrated assistant activated through configured voice phrases or hardware controls; third-party apps do not thereby receive Siri's always-on listener [13]. ChatGPT Voice is started from its in-app Voice control. An already-started conversation can continue in the background or while locked, and “Start with Voice” starts when ChatGPT is opened to an empty conversation; the documentation does not describe passive wake-word activation [14].

Accordingly, the current “Hey Jarvis” option is **foreground-service background listening with a visible system notification**, not a Gemini/Siri-style system hotword route. The app cannot silently open its voice UI from a background service; a notification tap is the safe handoff. For a future no-app-notification hotword experience, investigate implementing the assistant role and `VoiceInteractionService`, then verify device/OEM DSP support before committing to that design.

## Research implications and remaining technical limits

TurnGPT research treats turn-shift prediction as a contextual and pragmatic-completeness problem, not just a silence timer [15]. FireRedChat's open full-duplex system similarly separates streaming VAD, barge-in control, semantic end-of-turn detection and dialogue management, and evaluates false interruption, end-of-turn accuracy and end-to-end latency separately [16]. Those findings support keeping onset interruption, transcript finalization and turn completion as separate states. The current pipeline has VAD onset/interim interruption and acoustic endpointing, but does not yet have semantic end-of-turn prediction or a learned barge-in classifier.

The capture client currently requests 16 kHz directly. Android's `AudioRecord` documentation guarantees 44.1 kHz, not 16 kHz on every device. The code checks buffer size and recorder initialization and fails clearly if 16 kHz is unsupported; production qualification still needs a supported-rate fallback/resampler and tests across OEM devices [17]. Acoustic echo cancellation and noise suppression are requested when the platform exposes them, but availability and actual enablement vary by device; measure them on real hardware rather than assuming they are active [18] [19].

The Android voice screen intentionally ends an active session when the app backgrounds. The wake-word service is separate and pauses during a voice call. This keeps microphone ownership explicit, but means Nally does not yet offer an ongoing voice conversation that continues with the screen locked.

## Validation status and production gates

The completed work here is a source review and local patch, not a live-provider/device signoff. No Deepgram or ElevenLabs live credentials were used. Android compilation and device audio tests could not be run in the sandbox because the checkout has no Gradle wrapper and no system Gradle/Android SDK. Backend typecheck, tests and production build should be run before merging/pushing the documentation branch. After Android build validation, test playback drain timing, short/failed writes, focus loss, speaker/earpiece/Bluetooth routing, AEC/NS state, notification permission denial, wake handoff while locked, service restart, and microphone contention on multiple Android versions and OEMs.

The code still needs an explicit runtime test for 16 kHz capture portability, interruption while a PCM write is in progress, and wake-notification delivery with Android 13+ notification permission denied. The 15-second detector restart is a pragmatic retry interval, not a platform guarantee.

## References

[1]: https://developers.deepgram.com/docs/understand-endpointing-interim-results "Configure Endpointing and Interim Results"
[2]: https://developers.deepgram.com/docs/endpointing "Endpointing"
[3]: https://developers.deepgram.com/docs/utterance-end "Utterance End"
[4]: https://developer.android.com/reference/android/media/AudioTrack "AudioTrack API reference"
[5]: https://developer.android.com/guide/components/activities/background-starts "Background activity launch restrictions"
[6]: https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tts "Generate audio in real time with WebSockets"
[7]: https://developer.android.com/develop/background-work/services/fgs/service-types#microphone "Foreground service type: microphone"
[8]: https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start "Restrictions on starting foreground services from the background"
[9]: https://developer.android.com/reference/android/service/voice/VoiceInteractionService "VoiceInteractionService API reference"
[10]: https://developer.android.com/reference/android/app/role/RoleManager "RoleManager API reference"
[11]: https://source.android.com/docs/automotive/voice/voice_interaction_guide "Android Open Source Project voice interaction guide"
[12]: https://support.google.com/gemini/answer/14554984?hl=en&co=GENIE.Platform%3DAndroid "Use Gemini as your Android mobile assistant"
[13]: https://support.apple.com/guide/iphone/turn-on-and-activate-siri-iph83aad8922/ios "Turn on and activate Siri on iPhone"
[14]: https://help.openai.com/en/articles/20001274-chatgpt-voice "ChatGPT Voice"
[15]: https://aclanthology.org/2020.findings-emnlp.268/ "TurnGPT: A Transformer-based Language Model for Predicting Turn-taking in Spoken Dialog"
[16]: https://arxiv.org/abs/2509.06502 "FireRedChat: A Pluggable, Full-Duplex Voice Interaction System"
[17]: https://developer.android.com/reference/android/media/AudioRecord "AudioRecord API reference"
[18]: https://developer.android.com/reference/android/media/audiofx/AcousticEchoCanceler "AcousticEchoCanceler API reference"
[19]: https://developer.android.com/reference/android/media/audiofx/NoiseSuppressor "NoiseSuppressor API reference"
