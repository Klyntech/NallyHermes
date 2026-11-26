import assert from "node:assert/strict";
import test from "node:test";

const { estimateComplexityDetailed } = await import("../src/agent/orchestra.js");
const { shouldAutoAdvancedSearch, planSearchQueries } = await import("../src/agent/tools/web.js");
const { buildFollowUpContext } = await import("../src/agent/followUpContext.js");

test("dependencyCue is structural not domain", () => {
  const d = estimateComplexityDetailed(
    "Search the latest release notes and then summarize based on the result for the team."
  );
  assert.equal(d.signals.dependencyCue, true);
  assert.ok(d.complexity === "complex" || d.complexity === "standard");
});

test("auto advanced search for prices", () => {
  assert.equal(shouldAutoAdvancedSearch("What is the price of Claude API?"), true);
  assert.equal(shouldAutoAdvancedSearch("hello there"), false);
  const qs = planSearchQueries("Claude API pricing", false);
  assert.ok(qs.length >= 1);
});

test("follow-up surfaces candidate entities", () => {
  const ctx = buildFollowUpContext(
    [
      { role: "user", content: "When is the Arsenal match?" },
      { role: "assistant", content: "Arsenal play Chelsea this weekend." }
    ],
    "Confirm time"
  );
  assert.ok(ctx);
  assert.match(ctx!, /Arsenal|Chelsea|FOLLOW-UP/i);
});
