import assert from "node:assert/strict";
import test from "node:test";

const { routeRequest, toVoiceResponse } = await import("../src/agent/orchestra.js");
const { classifyFailure } = await import("../src/agent/failure.js");
const { applyObservation, shouldNotify } = await import("../src/agent/eventMonitor.js");

test("router avoids the planner for conversation, follow-up, and single actions", () => {
  assert.equal(routeRequest("Hi").usePlanner, false);
  assert.equal(routeRequest("Confirm time").mode, "direct");
  assert.equal(routeRequest("Remind me in 15 minutes").mode, "single_action");
  assert.equal(routeRequest("Research this and compare the results").mode, "planned");
});

test("router identifies event monitoring instead of fixed reminders", () => {
  const decision = routeRequest("Message me when the Barcelona match starts and update me every 30 minutes");
  assert.equal(decision.mode, "monitoring");
  assert.equal(decision.usePlanner, true);
});

test("failures are typed for safe recovery decisions", () => {
  assert.deepEqual(classifyFailure("Request timed out").kind, "timeout");
  assert.equal(classifyFailure("Request timed out").retryable, true);
  assert.equal(classifyFailure("This tool is not allowed").retryable, false);
  assert.equal(classifyFailure("Calendar overlap conflict").safeAlternative, true);
});

test("event monitor notifies once when a match transitions live", () => {
  const definition = {
    id: "match-1", subject: "Barcelona", condition: "starts" as const,
    intervalSeconds: 1800, stopWhen: "finished" as const, status: "active" as const,
    lastObservedState: "scheduled" as const, nextCheckAt: new Date("2026-11-08T20:50:00Z")
  };
  const observation = { state: "live" as const, observedAt: new Date("2026-11-08T21:00:00Z") };
  assert.equal(shouldNotify(definition, observation), true);
  const updated = applyObservation(definition, observation, true);
  assert.equal(updated.lastNotifiedState, "live");
  assert.equal(shouldNotify(updated, observation), false);
});

test("voice responses remain short and interruptible at the interface boundary", () => {
  assert.deepEqual(toVoiceResponse("Your reminder is set."), { text: "Your reminder is set.", speak: true, interruptible: true });
});
