import assert from "node:assert/strict";
import test from "node:test";

const {
  routeRequest,
  estimateComplexity,
  resolveResponseStyle,
  createExecutionState,
  toVoiceResponse,
  SPOKEN_STYLE_GUIDANCE
} = await import("../src/agent/orchestra.js");
const { classifyFailure } = await import("../src/agent/failure.js");
const { applyObservation, shouldNotify } = await import("../src/agent/eventMonitor.js");

test("simple chat stays on the direct adaptive path without the planner", () => {
  for (const request of ["Hi", "Thanks", "Ok", "Confirm time"]) {
    const decision = routeRequest(request);
    assert.equal(decision.mode, "adaptive");
    assert.equal(decision.usePlanner, false);
    assert.equal(decision.complexity, "simple");
  }
});

test("standard single asks use the direct loop", () => {
  const decision = routeRequest("What is the capital of Kenya?");
  assert.equal(decision.mode, "adaptive");
  assert.equal(decision.usePlanner, false);
  assert.ok(decision.complexity === "simple" || decision.complexity === "standard");
});

test("multi-step and comparative asks may use the planner", () => {
  const comparative = routeRequest(
    "Compare Anthropic Opus and Sonnet pricing, then list which cloud platforms carry each model."
  );
  assert.equal(comparative.mode, "adaptive");
  assert.equal(comparative.usePlanner, true);
  assert.equal(comparative.complexity, "complex");

  const structured = routeRequest(
    [
      "Please do the following:",
      "1. Search for the latest release notes",
      "2. Summarize breaking changes",
      "3. Draft a migration checklist for our bot"
    ].join("\n")
  );
  assert.equal(structured.usePlanner, true);
  assert.equal(structured.complexity, "complex");
});

test("adaptive routing does not invent event-monitor intent from wording alone", () => {
  const decision = routeRequest(
    "Message me when the Barcelona match starts and update me every 30 minutes"
  );
  assert.equal(decision.mode, "adaptive");
  // Complexity may be standard/complex from length, but mode stays adaptive
  // and we never flip to a special "monitor" mode from keywords.
  assert.ok(decision.mode === "adaptive");
});

test("spoken or voice channel prefers lower latency unless clearly complex", () => {
  const shortVoice = routeRequest("What's on my calendar tomorrow?", {
    channel: "voice",
    responseStyle: "spoken"
  });
  assert.equal(shortVoice.usePlanner, false);
  assert.ok(shortVoice.reason.toLowerCase().includes("spoken") || shortVoice.complexity !== "complex");

  const complexVoice = routeRequest(
    "Compare three pricing pages in detail, then build a migration plan with risks and a checklist.",
    { channel: "voice" }
  );
  // estimateComplexity is complex; voice bias only skips planner when not complex
  assert.equal(complexVoice.complexity, "complex");
  assert.equal(complexVoice.usePlanner, true);
});

test("response style defaults to spoken on the voice channel", () => {
  assert.equal(resolveResponseStyle("voice"), "spoken");
  assert.equal(resolveResponseStyle("telegram"), "text");
  assert.equal(resolveResponseStyle("voice", "text"), "text");
  assert.equal(resolveResponseStyle("telegram", "spoken"), "spoken");
});

test("execution state records channel, style, and route metadata", () => {
  const route = routeRequest("Hi");
  const state = createExecutionState(
    { text: "Hi", telegramId: "1", channel: "voice" },
    route,
    { maxModelRounds: 4, maxToolRounds: 4, maxParallelCalls: 2 }
  );
  assert.equal(state.channel, "voice");
  assert.equal(state.responseStyle, "spoken");
  assert.equal(state.complexity, route.complexity);
  assert.ok(state.routeReason);
});

test("estimateComplexity stays conservative on short messages", () => {
  assert.equal(estimateComplexity("Hi"), "simple");
  assert.equal(estimateComplexity("Remind me in 15 minutes"), "simple");
});

test("spoken style guidance is present for controller injection", () => {
  assert.match(SPOKEN_STYLE_GUIDANCE, /speech/i);
  assert.match(SPOKEN_STYLE_GUIDANCE, /short sentences/i);
});

test("failures are typed for safe recovery decisions", () => {
  assert.deepEqual(classifyFailure("Request timed out").kind, "timeout");
  assert.equal(classifyFailure("Request timed out").retryable, true);
  assert.equal(classifyFailure("This tool is not allowed").retryable, false);
  assert.equal(classifyFailure("Calendar overlap conflict").safeAlternative, true);
});

test("event monitor notifies once when a match transitions live", () => {
  const definition = {
    id: "match-1",
    subject: "Barcelona",
    condition: "starts" as const,
    intervalSeconds: 1800,
    stopWhen: "finished" as const,
    status: "active" as const,
    lastObservedState: "scheduled" as const,
    nextCheckAt: new Date("2026-11-08T20:50:00Z")
  };
  const observation = { state: "live" as const, observedAt: new Date("2026-11-08T21:00:00Z") };
  assert.equal(shouldNotify(definition, observation), true);
  const updated = applyObservation(definition, observation, true);
  assert.equal(updated.lastNotifiedState, "live");
  assert.equal(shouldNotify(updated, observation), false);
});

test("voice responses remain interruptible and bounded at the interface", () => {
  assert.deepEqual(toVoiceResponse("Your reminder is set."), {
    text: "Your reminder is set.",
    speak: true,
    interruptible: true
  });
  const long = "A".repeat(1200);
  const clipped = toVoiceResponse(long, { maxChars: 100 });
  assert.ok(clipped.text.length <= 110);
  assert.equal(clipped.speak, true);
});
