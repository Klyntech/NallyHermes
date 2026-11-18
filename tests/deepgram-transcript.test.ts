import assert from "node:assert/strict";
import { test } from "node:test";
import { DeepgramTranscriptBuffer } from "../src/mobile/deepgramTranscript.js";

test("partial transcript updates include earlier finalized segments", () => {
  const buffer = new DeepgramTranscriptBuffer();
  assert.deepEqual(buffer.update({ text: "Hello", isFinal: true, start: 0 }), {
    text: "Hello", final: false, utterance: null
  });
  assert.deepEqual(buffer.update({ text: "Nally", start: 0.5 }), {
    text: "Hello Nally", final: false, utterance: null
  });
});

test("repeated final event for one segment replaces it instead of duplicating it", () => {
  const buffer = new DeepgramTranscriptBuffer();
  buffer.update({ text: "Hello", isFinal: true, start: 0 });
  assert.deepEqual(buffer.update({ text: "Hello there", isFinal: true, speechFinal: true, start: 0 }), {
    text: "Hello there", final: true, utterance: "Hello there"
  });
});

test("speech-final event can flush accumulated final segments without repeating its final segment", () => {
  const buffer = new DeepgramTranscriptBuffer();
  buffer.update({ text: "Good morning", isFinal: true, start: 0 });
  assert.deepEqual(buffer.update({ text: "Good morning", isFinal: true, speechFinal: true, start: 0 }), {
    text: "Good morning", final: true, utterance: "Good morning"
  });
  assert.equal(buffer.flush(), null);
});

test("UtteranceEnd flushes final segments and ignores empty utterances", () => {
  const buffer = new DeepgramTranscriptBuffer();
  buffer.update({ text: "Please help", isFinal: true, start: 0 });
  assert.deepEqual(buffer.flush(), { text: "Please help", final: true, utterance: "Please help" });
  assert.equal(buffer.flush(), null);
});

test("empty speech-final safely flushes previously finalized segments", () => {
  const buffer = new DeepgramTranscriptBuffer();
  buffer.update({ text: "Turn left", isFinal: true, start: 0 });
  assert.deepEqual(buffer.update({ text: "", speechFinal: true }), {
    text: "Turn left", final: true, utterance: "Turn left"
  });
});
