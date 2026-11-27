import assert from "node:assert/strict";
import test from "node:test";

const { weekStartMondayUtc, weekEndSundayUtc, utcDateString } = await import("../src/agent/activityLog.js");

test("week bounds are Monday–Sunday UTC with explicit dates", () => {
  // 2026-11-26 is Thursday
  assert.equal(weekStartMondayUtc("2026-11-26"), "2026-11-23");
  assert.equal(weekEndSundayUtc("2026-11-23"), "2026-11-29");
  assert.match(utcDateString(), /^\d{4}-\d{2}-\d{2}$/);
});
