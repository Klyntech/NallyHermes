import assert from "node:assert/strict";
import test from "node:test";
import { decodePcm16Frame, encodePcm16Frame, VOICE_AUDIO_HEADER_BYTES } from "../public/voice-audio-protocol.js";

test("PCM audio frame round-trips codec and generation metadata", () => {
  const samples = new Int16Array([0, 1, -1, 1200, -1200]);
  const frame = encodePcm16Frame(samples.buffer, 17, 4);
  const decoded = decodePcm16Frame(frame);
  assert.ok(decoded);
  assert.equal(decoded.turnId, 17);
  assert.equal(decoded.generationId, 4);
  assert.deepEqual(Array.from(decoded.samples), Array.from(samples));
  assert.equal(frame.byteLength, VOICE_AUDIO_HEADER_BYTES + samples.byteLength);
});

test("PCM audio frame rejects invalid headers, payloads and identifiers", () => {
  const frame = encodePcm16Frame(new Int16Array([1, 2]).buffer, 1, 1);
  const corrupted = frame.slice(0);
  new Uint8Array(corrupted)[5] = 99;
  assert.equal(decodePcm16Frame(corrupted), null);
  assert.equal(decodePcm16Frame(new ArrayBuffer(VOICE_AUDIO_HEADER_BYTES)), null);
  assert.throws(() => encodePcm16Frame(new ArrayBuffer(1)), /PCM payload/);
  assert.throws(() => encodePcm16Frame(new Int16Array([1]).buffer, -1, 0), /identifiers/);
});
