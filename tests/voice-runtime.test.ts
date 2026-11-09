import assert from "node:assert/strict";
import test from "node:test";
import { parseVoiceClientEvent } from "../src/voice/protocol.js";
import { VoiceSession, VoiceSessionRegistry } from "../src/voice/session.js";

test("session assigns monotonically increasing turn and generation identifiers", () => {
  const session = new VoiceSession("s-1");
  const turn1 = session.beginTurn();
  const response1 = session.beginResponse(turn1);
  assert.equal(turn1, 1);
  assert.equal(response1.generationId, 1);
  assert.equal(session.finishResponse(turn1, response1.generationId), true);

  const turn2 = session.beginTurn();
  const response2 = session.beginResponse(turn2);
  assert.equal(turn2, 2);
  assert.ok(response2.generationId > response1.generationId);
});

test("interrupt aborts active work and rejects every stale output chunk", () => {
  const session = new VoiceSession("s-2");
  const turnId = session.beginTurn();
  const response = session.beginResponse(turnId);

  const interrupted = session.interrupt("barge_in");
  assert.ok(interrupted);
  assert.equal(response.signal.aborted, true);
  assert.equal(session.acceptsOutput(turnId, response.generationId), false);
  assert.equal(session.finishResponse(turnId, response.generationId), false);
  assert.equal(session.hasActiveResponse, false);
});

test("a new user turn fences off an assistant response still in progress", () => {
  const session = new VoiceSession("s-3");
  const firstTurn = session.beginTurn();
  const oldResponse = session.beginResponse(firstTurn);

  const secondTurn = session.beginTurn();
  assert.equal(secondTurn, firstTurn + 1);
  assert.equal(oldResponse.signal.aborted, true);
  assert.equal(session.acceptsOutput(firstTurn, oldResponse.generationId), false);

  const newResponse = session.beginResponse(secondTurn);
  assert.equal(session.acceptsOutput(secondTurn, newResponse.generationId), true);
});

test("repeated interruption is idempotent and does not abort a later response", () => {
  const session = new VoiceSession("s-4");
  const turnId = session.beginTurn();
  const first = session.beginResponse(turnId);

  assert.ok(session.interrupt());
  assert.equal(session.interrupt(), undefined);
  const second = session.beginResponse(turnId);
  assert.equal(second.signal.aborted, false);
  assert.equal(session.acceptsOutput(turnId, second.generationId), true);
  assert.equal(first.signal.aborted, true);
});

test("closing a session aborts active generation and prevents reuse", () => {
  const session = new VoiceSession("s-5");
  const turnId = session.beginTurn();
  const response = session.beginResponse(turnId);
  session.close();
  session.close();

  assert.equal(session.status, "closed");
  assert.equal(response.signal.aborted, true);
  assert.equal(session.acceptsOutput(turnId, response.generationId), false);
  assert.throws(() => session.beginTurn(), /closed/);
});

test("registry enforces capacity and isolates sessions", () => {
  const registry = new VoiceSessionRegistry(2);
  const first = registry.create("first");
  const second = registry.create("second");
  const firstTurn = first.beginTurn();
  const firstResponse = first.beginResponse(firstTurn);

  assert.equal(registry.get("second")?.hasActiveResponse, false);
  assert.throws(() => registry.create("third"), /capacity/);
  assert.equal(registry.close("first"), true);
  assert.equal(firstResponse.signal.aborted, true);
  assert.equal(registry.get("first"), undefined);
  assert.equal(registry.size, 1);
  registry.closeAll();
  assert.equal(second.status, "closed");
  assert.equal(registry.size, 0);
});

test("protocol parser accepts valid events and rejects malformed or unsupported data", () => {
  assert.deepEqual(
    parseVoiceClientEvent('{"v":1,"type":"session.start","sessionId":"abc"}'),
    { v: 1, type: "session.start", sessionId: "abc" }
  );
  assert.deepEqual(
    parseVoiceClientEvent({ v: 1, type: "turn.cancel", sessionId: "abc", turnId: 2 }),
    { v: 1, type: "turn.cancel", sessionId: "abc", turnId: 2 }
  );
  assert.throws(() => parseVoiceClientEvent("{"), /Malformed/);
  assert.throws(() => parseVoiceClientEvent({ v: 2, type: "session.start", sessionId: "abc" }), /version/);
  assert.throws(() => parseVoiceClientEvent({ v: 1, type: "assistant.text.delta", sessionId: "abc" }), /Unsupported/);
  assert.throws(() => parseVoiceClientEvent({ v: 1, type: "turn.cancel", sessionId: "abc", turnId: 0 }), /turnId/);
  assert.throws(() => parseVoiceClientEvent({ v: 1, type: "session.start", sessionId: "" }), /sessionId/);
});

test("playback progress requires valid turn, generation and finite position", () => {
  assert.deepEqual(
    parseVoiceClientEvent({
      v: 1, type: "client.playback", sessionId: "abc",
      turnId: 1, generationId: 3, playedThroughMs: 120.5
    }),
    {
      v: 1, type: "client.playback", sessionId: "abc",
      turnId: 1, generationId: 3, playedThroughMs: 120.5
    }
  );
  assert.throws(() => parseVoiceClientEvent({
    v: 1, type: "client.playback", sessionId: "abc",
    turnId: 1, generationId: 3, playedThroughMs: Number.NaN
  }), /playback position/);
});
