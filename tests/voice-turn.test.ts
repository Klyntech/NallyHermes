import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { ElevenLabsStream, type SocketLike, type TtsEvents, type TtsHandle } from "../src/mobile/ttsStream.js";
import { VoiceTurn, type VoiceTurnDeps, type VoiceTurnEnd } from "../src/mobile/voiceTurn.js";

class FakeTts implements TtsHandle {
  texts: string[] = [];
  ended = false;
  aborted = false;
  constructor(readonly events: TtsEvents) {}
  get dead(): boolean { return this.aborted; }
  sendText(text: string): void { this.texts.push(text); }
  end(): void { this.ended = true; }
  abort(): void { this.aborted = true; }
}

function harness(overrides: Partial<VoiceTurnDeps> = {}) {
  const sent: Array<Record<string, unknown>> = [];
  const ttsList: FakeTts[] = [];
  const pcm: Buffer[] = [];
  let pacerCleared = 0;
  const ends: VoiceTurnEnd[] = [];
  const persisted: Array<[string, string]> = [];
  let release!: (answer: string | null) => void;
  const gate = new Promise<string | null>((resolve) => { release = resolve; });
  let agentSignal: AbortSignal | undefined;
  let emitDelta: (d: string) => void = () => undefined;
  const deps: VoiceTurnDeps = {
    runAgent: async (_text, { signal, onTextDelta }) => { agentSignal = signal; emitDelta = onTextDelta; return gate; },
    persist: async (u, a) => { persisted.push([u, a]); },
    splitSpoken: (answer) => answer.replace(/===SPOKEN===|===TEXT===[\s\S]*/g, "").trim(),
    createTts: (events) => { const t = new FakeTts(events); ttsList.push(t); return t; },
    pacer: { push: (c) => { pcm.push(c); }, clear: () => { pacerCleared++; }, whenDrained: (cb) => cb() },
    send: (m) => { sent.push(m as Record<string, unknown>); },
    clientStalled: () => false,
    maxOutputBytes: 1_000_000,
    ...overrides
  };
  const turn = new VoiceTurn("t1", "what is the weather", deps, (r) => ends.push(r));
  return {
    turn, sent, ttsList, pcm, ends, persisted, release, delta: (d: string) => emitDelta(d),
    get signal() { return agentSignal; }, get pacerCleared() { return pacerCleared; },
    types: () => sent.map((m) => m.type)
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("speech starts on the first sentence while the agent is still running", async () => {
  const h = harness();
  const running = h.turn.start();
  await tick();
  assert.equal(h.ttsList.length, 1, "TTS is pre-warmed before the agent answers");
  h.delta("===SPOKEN===\nSure. It is sunny");
  assert.deepEqual(h.ttsList[0]!.texts, ["Sure."]);
  h.delta(" today. Bring shades.\n===TEXT===\n| t |");
  h.release("===SPOKEN===\nSure. It is sunny today. Bring shades.\n===TEXT===\n| t |");
  await running;
  assert.equal(h.ttsList[0]!.ended, true);
  assert.equal(h.ttsList[0]!.texts.join(" "), "Sure. It is sunny today. Bring shades.");
  h.ttsList[0]!.events.onAudio(Buffer.alloc(3200));
  h.ttsList[0]!.events.onFinal();
  assert.deepEqual(h.types(), ["assistant_start", "text_delta", "text_delta", "audio_start", "audio_end", "assistant_end"]);
  assert.deepEqual(h.ends, ["finished"]);
  assert.deepEqual(h.persisted, [["what is the weather", "===SPOKEN===\nSure. It is sunny today. Bring shades.\n===TEXT===\n| t |"]]);
});

test("a planned answer with nothing streamed is spoken once it arrives", async () => {
  const h = harness();
  const running = h.turn.start();
  h.release("===SPOKEN===\nYou have two meetings. The first is at nine.");
  await running;
  assert.equal(h.ttsList[0]!.texts.join(" "), "You have two meetings. The first is at nine.");
  assert.equal(h.ttsList[0]!.ended, true);
});

test("needing approval ends only this turn with a turn-scoped error", async () => {
  const h = harness();
  const running = h.turn.start();
  h.release(null);
  await running;
  const error = h.sent.find((m) => m.type === "error");
  assert.equal(error?.scope, "turn");
  assert.equal(error?.code, "approval_required");
  assert.equal(h.sent.at(-1)?.type, "assistant_end");
  assert.equal(h.ttsList[0]!.aborted, true);
  assert.deepEqual(h.ends, ["failed"]);
});

test("a pre-warmed TTS connection that dies before any text is replaced, not fatal", async () => {
  const h = harness();
  const running = h.turn.start();
  await tick();
  h.ttsList[0]!.events.onError("tts_disconnected", "gone");
  h.ttsList[0]!.abort();
  h.delta("Hello there. ");
  h.release("Hello there.");
  await running;
  assert.equal(h.ttsList.length, 2);
  assert.deepEqual(h.ttsList[1]!.texts, ["Hello there."]);
  assert.equal(h.sent.some((m) => m.type === "error"), false);
});

test("a TTS failure after text was sent ends the turn with a recoverable error", async () => {
  const h = harness();
  const running = h.turn.start();
  await tick();
  h.delta("Hello there. ");
  h.ttsList[0]!.events.onError("tts_timeout", "Speech synthesis timed out.");
  h.release("Hello there.");
  await running;
  const error = h.sent.find((m) => m.type === "error");
  assert.equal(error?.code, "tts_timeout");
  assert.deepEqual(h.ends, ["failed"]);
});

test("provider finishing without audio is reported instead of a silent reply", async () => {
  const h = harness();
  const running = h.turn.start();
  h.release("Hello.");
  await running;
  h.ttsList[0]!.events.onFinal();
  assert.equal(h.sent.find((m) => m.type === "error")?.code, "tts_empty_audio");
});

test("abort before audio reports it, silences everything and cancels the agent", async () => {
  const h = harness();
  const running = h.turn.start();
  await tick();
  h.delta("Let me think. ");
  const snapshot = h.turn.abort();
  assert.deepEqual(snapshot, { audioStarted: false, text: "what is the weather" });
  assert.equal(h.signal?.aborted, true);
  assert.equal(h.ttsList[0]!.aborted, true);
  assert.ok(h.pacerCleared >= 1);
  h.release("late answer");
  await running;
  assert.deepEqual(h.ends, ["aborted"]);
  assert.equal(h.sent.some((m) => m.type === "audio_end" || m.type === "assistant_end"), false);
});

test("audio over the output limit fails the turn", async () => {
  const h = harness({ maxOutputBytes: 1_000 });
  const running = h.turn.start();
  h.release("Hello.");
  await running;
  h.ttsList[0]!.events.onAudio(Buffer.alloc(2_000));
  assert.equal(h.sent.find((m) => m.type === "error")?.code, "output_limit");
});

// ---- ElevenLabsStream against a fake socket ----
class FakeSocket extends EventEmitter implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closed = false;
  send(data: string): void { this.sent.push(data); }
  close(): void { this.closed = true; this.readyState = 3; }
  open(): void { this.readyState = 1; this.emit("open"); }
}

function stream(socket: FakeSocket) {
  const log: string[] = [];
  const s = new ElevenLabsStream(socket, { voiceSettings: { stability: 0.5 }, timeoutMs: 200 }, {
    onAudio: (c) => log.push(`audio:${c.length}`),
    onFinal: () => log.push("final"),
    onError: (code) => log.push(`error:${code}`)
  });
  return { s, log };
}

const audioMessage = (bytes: number, isFinal = false) =>
  JSON.stringify({ audio: Buffer.alloc(bytes).toString("base64"), isFinal });

test("tts stream queues text until the socket opens and keeps order", () => {
  const socket = new FakeSocket();
  const { s } = stream(socket);
  s.sendText("First sentence.");
  s.sendText("Second one.");
  s.end();
  assert.equal(socket.sent.length, 0);
  socket.open();
  const messages = socket.sent.map((m) => JSON.parse(m) as Record<string, unknown>);
  assert.equal(messages[0]!.text, " ");
  assert.deepEqual(messages[0]!.voice_settings, { stability: 0.5 });
  assert.equal(messages[1]!.text, "First sentence. ");
  assert.equal(messages[1]!.try_trigger_generation, true);
  assert.equal(messages[2]!.text, "Second one. ");
  assert.equal(messages[3]!.text, "");
});

test("tts stream reports audio then final once, and closes the socket", () => {
  const socket = new FakeSocket();
  const { s, log } = stream(socket);
  socket.open();
  s.sendText("Hi.");
  s.end();
  socket.emit("message", audioMessage(1600), false);
  socket.emit("message", audioMessage(0, true), false);
  socket.emit("close");
  assert.deepEqual(log, ["audio:1600", "final"]);
  assert.equal(socket.closed, true);
  assert.equal(s.dead, true);
});

test("tts stream treats a hang-up after audio as the end, and before audio as an error", () => {
  const a = new FakeSocket();
  const one = stream(a);
  a.open();
  a.emit("message", audioMessage(800), false);
  a.emit("close");
  assert.deepEqual(one.log, ["audio:800", "final"]);

  const b = new FakeSocket();
  const two = stream(b);
  b.open();
  b.emit("close");
  assert.deepEqual(two.log, ["error:tts_disconnected"]);
});

test("tts stream rejects malformed audio and times out", async () => {
  const a = new FakeSocket();
  const one = stream(a);
  a.open();
  a.emit("message", JSON.stringify({ audio: "***" }), false);
  assert.deepEqual(one.log, ["error:tts_invalid_audio"]);

  const b = new FakeSocket();
  const two = stream(b);
  b.open();
  two.s.sendText("Hello.");
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.deepEqual(two.log, ["error:tts_timeout"]);
});

test("aborted tts stream ignores late provider messages", () => {
  const socket = new FakeSocket();
  const { s, log } = stream(socket);
  socket.open();
  s.abort();
  socket.emit("message", audioMessage(1600, true), false);
  assert.deepEqual(log, []);
});
