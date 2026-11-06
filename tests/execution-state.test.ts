import assert from "node:assert/strict";
import test from "node:test";
import { collectStepEvidence, getReadyPlanSteps, orderPlanSteps } from "../src/agent/executionState.js";
import type { ExecutionPlanStep } from "../src/agent/smartPlanner.js";

const step = (id: string, depends_on: string[] = [], parallel_safe = true): ExecutionPlanStep => ({
  id, task: id, depends_on, parallel_safe
});

test("orders a valid dependency graph without changing independent step order", () => {
  const ordered = orderPlanSteps([
    step("publish", ["build"]),
    step("research"),
    step("build", ["research"])
  ]);
  assert.deepEqual(ordered?.map((item) => item.id), ["research", "build", "publish"]);
});

test("rejects duplicate IDs, missing dependencies, and self-dependencies", () => {
  assert.equal(orderPlanSteps([step("a"), step("a")]), null);
  assert.equal(orderPlanSteps([step("a", ["missing"])]), null);
  assert.equal(orderPlanSteps([step("a", ["a"])]), null);
});

test("rejects cyclic graphs", () => {
  assert.equal(orderPlanSteps([step("a", ["b"]), step("b", ["a"])]), null);
});

test("rejects duplicate dependency edges", () => {
  assert.equal(orderPlanSteps([step("a"), step("b", ["a", "a"])]), null);
});

test("returns only pending steps whose prerequisites have completed", () => {
  const steps = [
    step("first"),
    step("second", ["first"]),
    step("third", ["second"]),
    step("independent")
  ];
  const ready = getReadyPlanSteps(
    steps,
    new Set(["first"]),
    new Set(["second", "third", "independent"])
  );
  assert.deepEqual(ready.map((item) => item.id), ["second", "independent"]);
});

test("a recovered prerequisite makes its dependent ready on the next scheduling pass", () => {
  const steps = [step("source"), step("dependent", ["source"])];
  const pending = new Set(["source", "dependent"]);
  assert.deepEqual(getReadyPlanSteps(steps, new Set(), pending).map((item) => item.id), ["source"]);
  // Recovery changes the prerequisite state to completed; readiness is recalculated.
  assert.deepEqual(
    getReadyPlanSteps(steps, new Set(["source"]), new Set(["dependent"])).map((item) => item.id),
    ["dependent"]
  );
});

test("collects evidence only from the supplied step-local messages", () => {
  const priorConversation = [
    { role: "tool", tool_call_id: "old-call", content: "old result" }
  ];
  const currentStep = [
    { role: "system", content: "step instructions" },
    { role: "assistant", content: "I need one source." },
    { role: "tool", tool_call_id: "new-call", content: "{\\"source\\":\\"current\\"}" }
  ];
  const evidence = collectStepEvidence(currentStep);
  assert.deepEqual(evidence.observations, [
    { tool_call_id: "new-call", content: "{\\"source\\":\\"current\\"}" }
  ]);
  assert.deepEqual(evidence.assistantNotes, ["I need one source."]);
  assert.equal(evidence.observations.some((item) => item.tool_call_id === "old-call"), false);
  assert.equal(priorConversation.length, 1);
});

test("bounds collected observations and assistant notes", () => {
  const messages = [
    ...Array.from({ length: 10 }, (_, index) => ({
      role: "tool", tool_call_id: String(index), content: "result " + index
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      role: "assistant", content: "note " + index
    }))
  ];
  const evidence = collectStepEvidence(messages);
  assert.equal(evidence.observations.length, 8);
  assert.equal(evidence.observations[0]?.tool_call_id, "2");
  assert.equal(evidence.assistantNotes.length, 4);
  assert.equal(evidence.assistantNotes[0], "note 2");
});
