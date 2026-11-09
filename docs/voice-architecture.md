# Nally Voice Runtime — Architecture

Status: proposed foundation for Voice Beta  
Branch: `ChatGPT-NallyHermes-Voice-Starting`

## Product contract

Nally Voice is a first-class, full-duplex interface to Nally Hermes. Full duplex is a launch requirement: microphone input remains active while Nally is speaking; a user can interrupt at any time; the active response is cancelled and the session continues without a reset.

The runtime is owned by Nally. Speech recognition, language-model inference and speech synthesis are provider adapters, not the session controller. OpenAI Realtime API is not a runtime dependency.

## Repository constraints discovered

- Runtime: Node.js 20+, TypeScript, ESM, strict TypeScript.
- Existing HTTP server: Node `http.createServer` in `src/index.ts`, currently used for Telegram webhooks and health checks.
- Existing agent entry point: `runAgent(history, userMessage, telegramId, onProgress)`.
- Existing model integration: OpenAI-compatible Chat Completions client pointed at NVIDIA NIM.
- Existing conversation history is process-local and Telegram-scoped. Voice sessions must have their own identity and must not reuse Telegram identity as an authorization mechanism.
- Existing agent controller is request/response oriented and awaits complete model results. It cannot be treated as a streaming voice engine without a deliberate streaming interface.
- No browser application or WebSocket server is currently present.

## Runtime topology

```text
Browser (Web Audio / AudioWorklet)
  | bidirectional audio + control events
  | authenticated WebSocket session
  v
Nally Voice Gateway
  | session registry, limits, lifecycle, protocol validation
  v
Realtime Session Runtime
  |-- input pipeline: audio frames -> VAD/endpointing -> streaming STT
  |-- turn coordinator: partial/final transcript, turn ownership, barge-in
  |-- response pipeline: streaming LLM -> incremental text -> streaming TTS
  |-- output scheduler: ordered audio frames, playback acknowledgements
  |-- cancellation coordinator: abort signal + generation/turn fencing
  v
Nally Orchestra Adapter
  | context, tools, memory, execution, verified response
  v
Provider adapters (STT / LLM / TTS), replaceable independently
```

The browser and server exchange audio frames and typed control events concurrently. The gateway does not wait for a complete recording before forwarding audio. Output audio is chunked and scheduled as it arrives.

## Duplex and interruption semantics

Every session has a monotonically increasing turn identifier and every generated response has a generation identifier.

When speech is detected while output is active:
1. The session runtime emits an interruption event and advances the active generation fence.
2. It aborts the current LLM/TTS work through an AbortSignal where supported.
3. The browser immediately flushes queued audio for the interrupted generation.
4. Any late provider chunks carrying the old generation identifier are discarded by both server and client.
5. Incoming audio continues to be buffered/processed for the new user turn.
6. The coordinator reconciles the transcript and conversation state before starting the next response.

Stopping browser playback alone is not cancellation. Provider cancellation alone is not enough either: stale chunks must be fenced out after cancellation.

## Wire protocol (version 1)

All control messages are JSON objects with `v: 1`, `type`, and `sessionId`. Audio is sent as binary frames with a negotiated codec/sample-rate contract established during session setup. Control and audio frames are multiplexed on one authenticated WebSocket connection.

Client -> server control events:
- `session.start`: request a session; server authenticates and returns negotiated audio format and limits.
- `audio.start` / `audio.end`: optional stream lifecycle markers; normal microphone audio is continuous.
- `turn.cancel`: explicitly cancel the active response.
- `client.playback`: playback progress/flush acknowledgement.
- `session.stop`: close the session.

Server -> client control events:
- `session.ready`, `session.error`, `session.closed`
- `input.speech_start`, `input.transcript.partial`, `input.transcript.final`
- `assistant.response_start`, `assistant.text.delta`, `assistant.response_end`
- `assistant.audio.start`, `assistant.audio.end`
- `assistant.interrupted`
- `usage.update`

Every response-related event includes `turnId` and `generationId`. The client must ignore output events from an obsolete generation. Binary audio frames now use a fixed 16-byte header followed by PCM16 little-endian mono samples at 16 kHz. Header fields are: bytes 0–3 ASCII `NLYA`; byte 4 protocol version (`1`); byte 5 codec (`1` = PCM16/16 kHz/mono); byte 6 flags (`0` in v1); byte 7 reserved (`0`); bytes 8–11 unsigned big-endian turn ID; bytes 12–15 unsigned big-endian generation ID. Client microphone frames use turn/generation `0`; server output frames must carry the active response identifiers. Frames with stale identifiers are rejected by the gateway before transmission.

## Browser client foundation\n\nThe same-origin browser client is served from `/` and includes Telegram Login Widget authentication, a persistent `getUserMedia` microphone stream, an AudioWorklet that resamples to 16 kHz and emits 20 ms PCM16 frames, a binary WebSocket transport, and a Web Audio playback scheduler. The scheduler accepts only frames matching the active turn/generation and flushes queued sources on interruption. Local RMS-based barge-in detection sends `turn.cancel` while keeping microphone capture active.\n\nThe gateway now exposes generation-fenced `sendAudioFrame` and `sendEvent` methods for the future realtime pipeline. This is transport/client infrastructure, not yet a complete speech conversation: STT/VAD endpointing, streaming LLM/Orchestra integration, TTS, and runtime wiring remain separate milestones. The current microphone stream reaches the gateway, but no provider is attached yet, so a beta user should not expect spoken replies at this stage.\n\n## Provider contracts

Define narrow interfaces for:
- streaming speech recognition: accept audio frames, emit partial/final transcript events, support cancellation;
- streaming language generation: accept conversation/context and an AbortSignal, emit text deltas and structured tool-call events;
- streaming speech synthesis: accept text chunks and an AbortSignal, emit ordered audio chunks and completion metadata.

Provider adapters must expose capabilities and usage metadata. The runtime must not assume that every provider supports true streaming, cancellation, a particular codec, or word-level timestamps. Capability mismatches must be explicit rather than silently degrading the duplex contract.

## Orchestra integration

Voice is a channel adapter, not a second agent. The first integration should introduce a voice-facing agent interface that accepts session identity, conversation context and cancellation, and emits incremental response events.

The existing `runAgent` remains untouched until a streaming-capable controller can preserve:
- current plan/tool validation and execution limits;
- user-scoped memory and workspace isolation;
- mutation safety (no replay on interruption/retry);
- progress and recovery semantics;
- final verified response synthesis.

Do not serialize an entire voice session behind the existing Telegram conversation queue. Session concurrency and per-user concurrency limits belong in the voice runtime.

## Security and cost controls

- Authenticate before allocating provider resources.
- Use short-lived, server-issued session credentials; never expose provider API keys in browser code.
- Enforce per-user concurrent-session limits, maximum session duration, idle timeout, audio byte/rate limits and provider spend ceilings.
- Validate message sizes, event schemas, audio format and session ownership.
- Apply origin checks, connection throttling and safe close behavior.
- Record provider, model, audio seconds, text/token usage, session duration, cancellation count and latency. Do not log raw audio or sensitive transcript content by default.
- Cost controls must terminate or degrade safely before exceeding configured limits; they must not silently switch to an unapproved paid provider.

## Observability and quality gates

Measure at minimum:
- session establishment latency;
- first partial transcript latency;
- end-of-speech to first response text;
- end-of-speech to first playable audio;
- interruption-to-playback-stop latency;
- stale audio chunks accepted after interruption (must be zero);
- dropped/reordered audio frames;
- provider errors and reconnect recovery;
- per-session provider usage and estimated cost.

Do not set performance targets as achieved until measured on the deployed path. Benchmarks should include normal turns, rapid turn-taking, interruption during speech, repeated interruption, provider timeout, network loss and session teardown.

## Delivery sequence

1. Runtime contracts and deterministic tests (session state, generation fencing, cancellation, protocol validation).
2. WebSocket gateway and browser audio transport (no real provider dependency; exercise with fake adapters).
3. Provider capability evaluation and selection based on actual streaming, cancellation, latency, availability and cost.
4. Streaming STT and VAD/endpointing.
5. Streaming LLM adapter and safe Orchestra bridge.
6. Streaming TTS and browser playback scheduler.
7. End-to-end duplex tests and usage benchmarks.
8. Authentication, quotas, deployment, monitoring and beta hardening.

## Non-goals

- OpenAI Realtime API as the core runtime.
- A push-to-talk-only product.
- Recording a complete audio file and processing it after the user finishes.
- A second independent agent with duplicated tools or memory.
- Claiming low latency or low cost without measurements.


## Voice Beta v1 provider implementation

The first provider pairing is Deepgram streaming STT and ElevenLabs streaming PCM TTS. Configure these Render environment variables:

- `DEEPGRAM_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- optional `ELEVENLABS_MODEL_ID` (defaults to `eleven_turbo_v2_5`)

The browser's 16 kHz mono PCM16 frames are validated and forwarded to a per-session Deepgram Live WebSocket. Interim transcripts are emitted to the browser; Deepgram speech-start events establish turn boundaries and interrupt active output; speech-final transcripts are sent to the existing Nally Orchestra `respond` entry point. The resulting answer is synthesized by ElevenLabs using its streaming PCM endpoint and returned as generation-fenced 16 kHz audio frames.

Important v1 limitation: the existing Orchestra controller is request/response and tool-aware, so this integration preserves its existing planning, tools, memory and verification rather than bypassing it with a separate raw LLM call. Consequently, the LLM/Orchestra answer is currently awaited as a complete result before text and TTS streaming begin. ElevenLabs audio itself streams incrementally. A follow-up controller refactor is required to emit model text deltas while preserving tool-call rounds and safe cancellation. The current AbortSignal fences/cancels TTS and stale output, but cannot yet abort in-flight Orchestra model/tool operations. Do not describe this milestone as end-to-end token-streaming or fully cancellable tool execution.

The provider keys are optional at process startup so Telegram remains available without voice credentials. Starting a voice audio stream without the required provider keys fails closed with a session error; provider secrets are never sent to the browser.
