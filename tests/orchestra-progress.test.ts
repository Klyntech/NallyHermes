import assert from "node:assert/strict";
import test from "node:test";
import { displayProgress } from "../src/agent/progress.js";

test("progress distinguishes partial, blocked, and failed plan steps", () => {
  assert.match(displayProgress({ type: "plan_step_partial", index: 2, total: 4 })?.text ?? "", /partially completed/);
  assert.match(displayProgress({ type: "plan_step_blocked", index: 3, total: 4 })?.text ?? "", /blocked by a prerequisite/);
  assert.match(displayProgress({ type: "plan_step_failed", index: 1, total: 4 })?.text ?? "", /could not be completed/);
});

test("task outcome telemetry does not overwrite the user-facing progress message", () => {
  assert.equal(displayProgress({
    type: "task_status",
    status: "partial",
    completedSteps: 1,
    partialSteps: 1,
    failedSteps: 1,
    blockedSteps: 1,
    totalSteps: 4
  }), null);
});
