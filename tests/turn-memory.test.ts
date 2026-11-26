import assert from "node:assert/strict";
import test from "node:test";

const { extractDurableUserAssertions } = await import("../src/agent/turnMemory.js");

test("extracts explicit remember and name preferences", () => {
  const items = extractDurableUserAssertions("Remember that I prefer dark mode. My name is Ada.");
  assert.ok(items.length >= 1);
  assert.ok(items.some((i) => /dark mode/i.test(i.content) || i.kind === "preference" || i.kind === "fact"));
  assert.ok(items.some((i) => /Ada/i.test(i.content) || i.subject === "Ada"));
});

test("skips pure short questions", () => {
  assert.equal(extractDurableUserAssertions("What time is it?").length, 0);
});

test("skips empty", () => {
  assert.equal(extractDurableUserAssertions("").length, 0);
});
