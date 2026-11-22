# Native full-duplex voice: protocol v1

## Current implementation status

The initial voice vertical slice is implemented on the `Manus-Work-Full-Deplex-v3.5` branch. The Android client exchanges its existing bearer session for a 60-second, single-use ticket, upgrades to an authenticated WebSocket, captures mono PCM16 at 16 kHz only after runtime microphone permission, and sends bounded binary frames. The server opens a Deepgram live transcription socket, sends transcript events, routes finalized speech through the existing Nally `respond` pipeline (`channel: "voice"`, `responseStyle: "spoken"`), persists completed exchanges, and streams ElevenLabs TTS audio back over the same socket. Android plays the returned PCM chunks through `AudioTrack` and closes resources when the screen leaves or the app backgrounds.

The Voice screen uses the supplied mockup's layered orb treatment and state behavior, implemented natively in Compose and adapted to the app's MaterialTheme colors, typography, surfaces, and spacing. The orb responds to connection, listening, thinking, speaking, interruption, and unavailable states.

This is an implementation slice, not a production-readiness signoff. The provider path has not been exercised with live credentials, and the Android project could not be compiled in the sandbox because no Gradle wrapper/system Gradle or Android SDK is available. Server-focused mobile/protocol tests, TypeScript typecheck, production build, and whitespace checks pass. Automated tests for the provider lifecycle, ticket replay/expiry against a live database, and Android audio runtime behavior remain to be added.

## Protocol v1

A client obtains a ticket through authenticated `POST /api/mobile/voice-ticket`, then connects to `/api/mobile/voice?ticket=…`. The ticket is random, stored as an HMAC hash, expires after 60 seconds, and is atomically consumed during upgrade. The mobile bearer token is never placed in the WebSocket URL; provider credentials remain server-side. `VOICE_ENABLED` must be enabled and Deepgram/ElevenLabs credentials and voice ID configured.

Control events are small JSON text frames; audio uses binary frames. The client starts with protocol version 1. Server `ready` negotiates mono `pcm_s16le` at 16 kHz for microphone input. TTS events announce the same raw PCM16/16 kHz/mono format, followed by binary chunks. Control events include interim/final transcripts, assistant start/text, audio start/end, assistant end, interruption, ping/pong, and bounded errors.

The server enforces ticket replay protection, frame/transcript/audio/output limits, session duration and idle timeouts, process-level connection limits, one active socket per mobile session per process, upstream teardown, and bounded/backpressure-aware sends. Origin headers are allowlisted by `MOBILE_VOICE_ALLOWED_ORIGINS`; native clients without an Origin header are permitted. A reverse proxy must support WebSocket upgrades and retain suitable timeout/body limits.

## Streaming and interruption behavior

Microphone input stays open while Nally is speaking. Android captures with the speech-recognition audio source and sends PCM frames over a bounded WebSocket queue; a brief send-queue spike is tolerated, while a sustained stall is reported as an upload stall rather than automatically blamed on the user's network. Deepgram interim/final segments are accumulated for captions, repeated final segments at the same media start replace rather than duplicate text, and `speech_final`, empty speech-final, or `UtteranceEnd` flushes the recognized utterance. Deepgram provider errors are surfaced instead of being silently ignored. The final ElevenLabs input includes `flush: true`; the stream must not send an empty text string to flush because that value closes the provider WebSocket. Speech-start/interim events cancel the active TTS socket and abort the active model request through an `AbortSignal`, so barge-in stops both speech playback and cancellable model generation. A new finalized utterance retires any prior turn before starting another. Stale model results are checked before persistence and again after the persistence await, and TTS timers/sockets are cleared on completion, interruption, disconnect, or session teardown. Finalized transcripts use the existing agent orchestration and its tool/approval safeguards. Requests that require approval return an explicit approval-needed error; approval currently still takes place in Telegram.

The agent controller still returns a complete answer before TTS starts; the text is delivered as one text event, and ElevenLabs audio is chunk-streamed. This is duplex audio transport with barge-in cancellation, but it is not yet incremental model-to-speech generation. A model request is aborted on interruption; an already-running external tool operation may not support cancellation and can finish in the background, but its stale result is not used for speech or persisted by the interrupted turn. Incremental spoken-token-to-TTS streaming remains a separate latency milestone because it must preserve the spoken/text split and the existing factual-audit, tool-call, and approval boundaries.

The Android keyboard control intentionally routes typed text to the existing Chat endpoint because protocol v1 has no text-input event. Captions are local UI visibility controls; transcript/text updates are still available from the server.

## Production gates

Before enabling for general production use:

- Run live-provider integration tests for Deepgram authentication, transcript segmentation, ElevenLabs `pcm_16000` support with the configured model/voice, PCM playback, provider disconnects, and barge-in. No live provider credentials were used in implementation checks.
- Add automated provider lifecycle/state-transition tests, durable ticket replay/expiry tests, and concurrency/isolation tests. The single-session limit is process-local; multi-instance deployments need a shared lease/connection limit if one-active-session-per-user must be global.
- Add model/tool cancellation propagation where safe; never interrupt a mutating operation in a way that leaves its outcome uncertain.
- Validate Android playback routing, acoustic echo cancellation/noise handling, audio focus, microphone permission denial/recovery, low-memory/background behavior, and accessibility/reduced-motion behavior on real devices.
- Confirm runtime configuration, database schema bootstrap, WSS proxy behavior/timeouts, and monitoring/retention policy. Keep audio/transcripts private and avoid logging raw audio or secrets.

## References

- [Deepgram live audio WebSocket reference](https://developers.deepgram.com/reference/speech-to-text/listen-streaming)
- [ElevenLabs streaming TTS WebSocket reference](https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input)
- [NVIDIA NIM API reference](https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html)
