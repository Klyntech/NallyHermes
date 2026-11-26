import assert from "node:assert/strict";
import test from "node:test";

const { SYSTEM_PROMPT } = await import("../src/agent/systemPrompt.js");

test("identity centers on Nally as one continuous application-controlled agent", () => {
  assert.match(SYSTEM_PROMPT, /\bNally\b/);
  assert.match(SYSTEM_PROMPT, /application-controlled/i);
  assert.match(SYSTEM_PROMPT, /I'm Nally/i);
  assert.doesNotMatch(SYSTEM_PROMPT, /As an AI assistant trained/i);
});

test("spoken accuracy is explicit in the system prompt", () => {
  assert.match(SYSTEM_PROMPT, /Spoken channel accuracy/i);
});
