import assert from "node:assert/strict";
import { test } from "node:test";
import { buildElevenLabsTextInput } from "../src/mobile/elevenLabsStream.js";

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
