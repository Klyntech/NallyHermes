import assert from "node:assert/strict";
import test from "node:test";
import { buildStepContext } from "../src/agent/stepContext.js";
import type { StepExecutionOutcome } from "../src/agent/stepContext.js";
import type { ExecutionPlanStep } from "../src/agent/smartPlanner.js";

const plan: ExecutionPlanStep[] = [
  { id: "locate", task: "Find official docs", depends_on: [], parallel_safe: true },
  { id: "backends", task: "List backends", depends_on: ["locate"], parallel_safe: true },
  { id: "neon", task: "Evaluate Neon", depends_on: ["backends"], parallel_safe: true },
  { id: "recommend", task: "Recommend architecture", depends_on: ["neon"], parallel_safe: false },
  { id: "unrelated", task: "Unrelated independent task", depends_on: [], parallel_safe: true }
];

const outcome = (id: string, task: string): StepExecutionOutcome => ({
  id, task, status: "completed", toolRounds: 1,
  answer: `Verified answer for ${id}`,
  evidence: { observations: [{ tool_call_id: id + "-tool", content: `Source evidence for ${id}` }], assistantNotes: [`Note for ${id}`] }
});

test("step context keeps the original request and only prerequisite outcomes", () => {
  const base = [{ role: "system", content: "Stable agent instructions" }, { role: "user", content: "Original user request" }] as never;
  const context = buildStepContext(base, plan[3]!, plan, [
    outcome("locate", "Find official docs"), outcome("backends", "List backends"), outcome("unrelated", "Unrelated")
  ]);
  const serialized = JSON.stringify(context);
  assert.match(serialized, /Original user request/);
  assert.match(serialized, /Verified answer for locate/);
  assert.match(serialized, /Verified answer for backends/);
  assert.doesNotMatch(serialized, /Unrelated independent task/);
  assert.doesNotMatch(serialized, /Verified answer for unrelated/);
  assert.match(serialized, /Recommend architecture/);
});

test("independent steps do not receive unrelated completed work", () => {
  const context = buildStepContext([{ role: "user", content: "Original request" }] as never, plan[4]!, plan, [outcome("locate", "Find official docs")]);
  const serialized = JSON.stringify(context);
  assert.match(serialized, /Original request/);
  assert.match(serialized, /Unrelated independent task/);
  assert.doesNotMatch(serialized, /Verified answer for locate/);
});

test("prerequisite evidence package is bounded", () => {
  const large = outcome("locate", "Find official docs");
  large.answer = "x".repeat(20_000);
  large.evidence.observations = Array.from({ length: 8 }, (_, i) => ({ tool_call_id: String(i), content: "y".repeat(10_000) }));
  const context = buildStepContext([{ role: "user", content: "Original request" }] as never, plan[1]!, plan, [large]);
  const shared = context.find((message) => message.role === "system" && String(message.content).includes("Relevant prerequisite results"));
  assert.ok(shared);
  assert.ok(JSON.stringify(shared).length < 25_000);
});
