import assert from "node:assert/strict";
import { test } from "node:test";
import { buildElevenLabsTextInput, decodeElevenLabsPcmChunk, hasUsableTtsAudio } from "../src/mobile/elevenLabsStream.js";

test("final spoken text is flushed on the non-empty generation message", () => {
  assert.deepEqual(buildElevenLabsTextInput("Hello, Nally."), {
    text: "Hello, Nally.",
    try_trigger_generation: true,
    flush: true
  });
});

test("empty TTS text is rejected so it cannot close the provider socket", () => {
  assert.throws(() => buildElevenLabsTextInput("  "), /must not be empty/);
});

test("empty ElevenLabs audio payloads are ignored instead of starting playback", () => {
  assert.equal(decodeElevenLabsPcmChunk(undefined), null);
  assert.equal(decodeElevenLabsPcmChunk(""), null);
});

test("ElevenLabs audio payloads must be valid base64 and aligned to PCM16 frames", () => {
  assert.deepEqual(decodeElevenLabsPcmChunk(Buffer.from([0, 1, 2, 3]).toString("base64")), Buffer.from([0, 1, 2, 3]));
  assert.throws(() => decodeElevenLabsPcmChunk("not base64!"), /malformed base64/);
  assert.throws(() => decodeElevenLabsPcmChunk(Buffer.from([0, 1, 2]).toString("base64")), /non-frame-aligned/);
});

test("finalized TTS turns require at least one emitted PCM chunk", () => {
  assert.equal(hasUsableTtsAudio(false, 0), false);
  assert.equal(hasUsableTtsAudio(true, 0), false);
  assert.equal(hasUsableTtsAudio(true, 2), true);
});
