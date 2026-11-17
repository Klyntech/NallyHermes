import assert from "node:assert/strict";
import test from "node:test";

const { shouldUseSemanticMemory } = await import("../src/agent/memoryRouting.js");

test("schedule and reminder lookups do not invoke semantic memory", () => {
  assert.equal(shouldUseSemanticMemory("Schedules i have for next week"), false);
  assert.equal(shouldUseSemanticMemory("List my reminders"), false);
  assert.equal(shouldUseSemanticMemory("What is on my calendar tomorrow?"), false);
});

test("academic library searches do not mix in personal-memory context", () => {
  assert.equal(shouldUseSemanticMemory("What do my lecture notes say about section 36?"), false);
  assert.equal(shouldUseSemanticMemory("Are these sections from my library?"), false);
  assert.equal(shouldUseSemanticMemory("Search my uploaded PDFs for negligence."), false);
});

test("personal facts and project context may use semantic memory", () => {
  assert.equal(shouldUseSemanticMemory("What is my preferred study style?"), true);
  assert.equal(shouldUseSemanticMemory("Recall the decisions from my project"), true);
});
