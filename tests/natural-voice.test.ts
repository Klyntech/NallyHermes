import assert from "node:assert/strict";
import test from "node:test";

const { SYSTEM_PROMPT } = await import("../src/agent/definitions.js");

test("Nally does not volunteer an AI capability disclaimer", () => {
  assert.match(SYSTEM_PROMPT, /Do not volunteer a technical explanation of how you work/);
  assert.match(SYSTEM_PROMPT, /Do not introduce yourself as an AI assistant/);
  assert.match(SYSTEM_PROMPT, /answer honestly but briefly/);
});

test("Nally is guided to respond naturally to emotional reactions", () => {
  assert.match(SYSTEM_PROMPT, /Acknowledge emotional reactions in context/);
  assert.match(SYSTEM_PROMPT, /Yeah, that one hurts/);
});

test("Nally is guided to keep ordinary replies short and result-first", () => {
  assert.match(SYSTEM_PROMPT, /one or two natural sentences/);
  assert.match(SYSTEM_PROMPT, /lead with the result in ordinary language/);
  assert.match(SYSTEM_PROMPT, /Do not turn a greeting, reaction, or simple update into a product tour/);
});
