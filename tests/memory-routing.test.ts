import assert from "node:assert/strict";
import test from "node:test";

const { shouldUseSemanticMemory } = await import("../src/agent/memoryRouting.js");

test("schedule and reminder lookups do not invoke semantic memory", () => {
  assert.equal(shouldUseSemanticMemory("Schedules i have for next week"), false);
  assert.equal(shouldUseSemanticMemory("List my reminders"), false);
  assert.equal(shouldUseSemanticMemory("What is on my calendar tomorrow?"), false);
});

test("personal facts and project context may use semantic memory", () => {
  assert.equal(shouldUseSemanticMemory("What is my preferred study style?"), true);
  assert.equal(shouldUseSemanticMemory("Recall the decisions from my project"), true);
});
