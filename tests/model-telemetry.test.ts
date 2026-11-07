import assert from "node:assert/strict";
import test from "node:test";
import { createModelCallTelemetry } from "../src/agent/modelTelemetry.js";

test("records model call phase, reason, context mode, duration, and token usage", async () => {
  const traces: Array<Record<string, unknown>> = [];
  const telemetry = createModelCallTelemetry((trace) => { traces.push(trace); });
  const response = await telemetry.run({
    phase: "planning",
    reason: "classify_request",
    model: "test-model",
    contextMode: "bounded_history",
    messages: [{ role: "user", content: "Find official docs." }]
  }, async () => ({
    usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    choices: []
  }));

  assert.equal(response.usage.total_tokens, 150);
  assert.equal(traces.length, 1);
  assert.equal(traces[0]?.call_number, 1);
  assert.equal(traces[0]?.phase, "planning");
  assert.equal(traces[0]?.reason, "classify_request");
  assert.equal(traces[0]?.context_mode, "bounded_history");
  assert.equal(traces[0]?.status, "success");
  assert.equal(traces[0]?.input_tokens, 120);
  assert.equal(traces[0]?.output_tokens, 30);
  assert.equal(typeof traces[0]?.duration_ms, "number");
  assert.equal(telemetry.getCalls().length, 1);
});

test("records failed model calls and rethrows the original error", async () => {
  const telemetry = createModelCallTelemetry();
  await assert.rejects(
    telemetry.run({
      phase: "synthesis",
      reason: "final_report",
      model: "test-model",
      contextMode: "full_accumulated",
      messages: [{ role: "assistant", content: "evidence" }]
    }, async () => { throw new Error("provider unavailable"); }),
    /provider unavailable/
  );

  const [trace] = telemetry.getCalls();
  assert.equal(trace?.call_number, 1);
  assert.equal(trace?.status, "error");
  assert.equal(trace?.error, "provider unavailable");
});

test("assigns unique sequential call numbers when calls overlap", async () => {
  const telemetry = createModelCallTelemetry();
  await Promise.all([1, 2, 3].map((index) => telemetry.run({
    phase: "step_execution",
    reason: "step_" + index,
    model: "test-model",
    contextMode: "step_context_full",
    messages: [{ role: "user", content: String(index) }]
  }, async () => ({ usage: null }))));

  assert.deepEqual(telemetry.getCalls().map((call) => call.call_number).sort(), [1, 2, 3]);
});
