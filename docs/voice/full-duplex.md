# Native full-duplex voice: v1 transport contract

## Current status

This is the initial transport-contract milestone for the Android client on the v3.4 backend baseline. `src/mobile/voiceProtocol.ts` defines the JSON control plane and binary input-frame guard, with unit tests in `tests/voice-protocol.test.ts`. This is not yet a functioning voice session: there is no authenticated WebSocket upgrade, provider bridge, Android audio capture/playback, or end-to-end conversation path in this milestone.

## Baseline constraints

The v3.4 voice code processes completed audio uploads through Deepgram and creates a complete ElevenLabs audio response. It does not expose a live audio socket. `runAgent` in `src/agent/controller.ts` also returns a completed answer; progress events are not model-token deltas. The Android branch has a Voice-screen placeholder and no microphone permission/capture implementation.

The app branch and v3.4 backend are not directly interchangeable. The Android branch additionally calls Google/GitHub login and account-link endpoints that are absent from the v3.4 `src/mobile/http.ts`. Voice work should reuse v3.4 pairing/session authorization and must not assume all other Android account features already work against that backend.

## Protocol v1

The intended connection is authenticated with a short-lived, single-use voice ticket minted over the existing HTTPS mobile API. Provider credentials remain exclusively on the backend. Client control events are small JSON text frames; microphone audio is sent as raw binary PCM frames to avoid base64 expansion. A `start` message negotiates protocol version 1 and may include a bounded BCP-47 language hint. The backend sends `ready` with the required `pcm_s16le`, 16 kHz, mono input format.

The client may send `stop_input` to finish an utterance while keeping the session open, `interrupt` to cancel current response playback/generation, `ping` for an application-level heartbeat, and `close` to end the session. The server can send interim/final `transcript` events, `assistant_start`, `text_delta`, `audio_start`, binary audio chunks, `audio_end`, `assistant_end`, `interrupted`, `pong`, and bounded `error` events. Transcript speech arriving during output must be able to interrupt that turn; audio output is dropped for the canceled turn before the next response starts.

Raw audio is untrusted input. The WebSocket layer must enforce authentication, origin policy, frame-size and total-session limits, idle timeout, connection limits, bounded outbound queues, and explicit teardown of upstream provider sockets. Ticket replay must fail. Do not put long-lived mobile tokens or provider credentials in a query string.

## Provider pipeline to implement

The existing backend integrations suggest a server-only bridge using Deepgram live transcription, the current NVIDIA NIM agent, and ElevenLabs streaming TTS. NVIDIA NIM documents streaming Chat Completions, but v3.4's agent controller currently makes non-streaming calls and has tool/planning rounds that must remain intact. The provider bridge therefore needs an explicit incremental-output callback in the agent path, with cancellation propagated from a user interruption. Keep text-only/mobile chat as the fallback if realtime setup or any provider fails.

Deepgram live transcription uses a provider-authenticated WebSocket and emits interim/final transcript results. ElevenLabs streaming TTS accepts partial text over WebSocket and emits audio chunks; its documented streaming TTS endpoint does not support some newest model families, so the exact model must be configured and tested before release. Keep all provider sockets and keys on the server.

## Production gates

Before enabling this in the production app, complete authenticated one-time voice tickets, server WebSocket upgrade/bridge, microphone permission and AudioRecord/AudioTrack lifecycle, interruption/cancellation, reconnect/expiry behavior, and Android foreground/background handling. Add tests for ticket replay/expiry, binary framing, oversized and malformed input, disconnect cleanup, provider failure, and concurrent user isolation. Verify reverse-proxy WebSocket support and limits in the deployed host. The current v3.4 process uses in-memory live activity, so session recovery must rely on durable conversation state rather than that activity map.

## References

- [Deepgram live audio WebSocket reference](https://developers.deepgram.com/reference/speech-to-text/listen-streaming)
- [ElevenLabs real-time TTS WebSocket guide](https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tts)
- [NVIDIA NIM API reference](https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html)
