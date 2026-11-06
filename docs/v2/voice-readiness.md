# Voice readiness: Full-duplex interfaces

Status: architectural requirement for V2; voice implementation is deferred to V2.5 or V3.

## Objective

Nally's Orchestra must remain the single reasoning and execution engine when voice is introduced. A voice interface must not create a second planner, tool executor, memory system, or conversation state machine.

Full duplex means the user may speak while Nally is speaking or working. The system must be able to accept that input, decide whether it is a continuation or interruption, and coordinate the active response without corrupting tool execution or conversation history.

## Required separation

The architecture has four distinct responsibilities:

1. **Interface session adapter** — owns Telegram or voice transport details, session lifecycle, inbound media/text events, and outbound delivery.
2. **Conversation/turn manager** — associates incoming user turns with a conversation, handles turn ordering, interruption policy, and response delivery state.
3. **Orchestration kernel** — owns planning, task state, tool execution, evidence, authorization, budgets, cancellation checkpoints, and final response content.
4. **Speech pipeline** — handles audio capture, speech recognition, speech synthesis, voice activity detection, and audio streaming. It does not decide agent plans or invoke tools directly.

The orchestration kernel must not import Telegram, audio codec, speech provider, or transport SDK types.

## Full-duplex execution requirements

### 1. Independent input and output streams

A voice session must be able to receive user input while output audio is being streamed. Incoming audio events and outgoing speech chunks are transport events, not new agent tools.

### 2. Explicit turn and response identity

Every request/turn should have a stable request ID. Every generated response should have a response ID and monotonically increasing sequence number. Events must be correlatable to the request, response, plan step, and tool call where relevant.

Late events from a superseded response must not overwrite or resume a newer response.

### 3. Interruption and barge-in

Interruption is a control-plane event, not a tool call. The turn manager decides whether the new user input:
- interrupts speech output only;
- asks the active task to pause at a safe checkpoint;
- cancels the active request;
- or starts a queued follow-up after the current request.

The default policy for V2 should be conservative: stop outbound speech promptly, preserve completed work, and do not silently cancel an in-flight mutation. Mutations must reach a known safe outcome or be reported as uncertain before a replacement task proceeds.

### 4. Cancellation and safe checkpoints

The execution context should accept an AbortSignal or equivalent cancellation token. Model requests, read-only tools, and long-running operations should observe cancellation where their APIs support it. Cancellation must be checked between plan steps and before starting a new tool call.

A cancellation request cannot guarantee that a remote operation already accepted by a provider has stopped. The execution record must distinguish cancelled-before-start, cancellation-requested, completed, and outcome-unknown states where appropriate.

### 5. Streamable response events

The core should produce semantic response events rather than requiring every interface to wait for one final string. The future event contract should support:
- response started;
- text delta;
- speech-ready text segment;
- progress/status update;
- response interrupted;
- response completed;
- response failed.

Text and speech rendering remain adapter responsibilities. Telegram may continue to aggregate these events into its existing single editable progress message and final text response.

### 6. Conversation consistency

Partial speech output must not be treated as a completed assistant turn. Conversation history should record the final committed assistant response, plus interruption metadata where needed. A transcript fragment must not accidentally become authoritative context before the turn manager commits it.

### 7. Tool execution independence

Speech interruption must not automatically replay, duplicate, or roll back tool calls. Existing authorization and confirmation rules remain authoritative. Read-only work may be cancelled at safe boundaries; mutation outcomes must be tracked explicitly.

## V2 foundations to build now

- Keep the orchestration API independent of Telegram-specific context types.
- Introduce a request-scoped execution context and cancellation boundary.
- Give progress and execution events stable correlation fields.
- Separate execution state from presentation state.
- Model response lifecycle explicitly, including interrupted and superseded output.
- Keep event ordering deterministic and make late events harmless.
- Preserve structured evidence and completed step outcomes across interruption.
- Keep provider-specific streaming and audio support behind adapters.

## Deferred until V2.5/V3

- Microphone/audio capture and streaming transport.
- Speech recognition and synthesis providers.
- Voice activity detection and endpointing.
- Barge-in latency tuning and echo handling.
- Audio codec, buffering, jitter, and playback controls.
- Voice-specific UX and device/session management.

These are intentionally deferred. V2 should establish the contracts and lifecycle boundaries, not prematurely select a speech provider or add audio dependencies.

## Acceptance criteria for voice readiness

The Orchestra is voice-ready when a future voice adapter can:
1. submit a user turn without importing or changing orchestration internals;
2. receive ordered semantic response events;
3. interrupt or cancel a response by request ID;
4. stop speech output without corrupting the underlying task record;
5. preserve completed work and structured evidence across interruption;
6. distinguish a cancelled task from a completed task and an unknown external operation outcome;
7. resume or start a follow-up without duplicate tool execution;
8. coexist with the Telegram adapter using the same orchestration kernel.

Voice readiness does not mean audio features are already implemented or tested.
