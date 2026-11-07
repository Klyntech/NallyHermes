import assert from "node:assert/strict";
import test from "node:test";
import { buildStepContext, compactStepConversation } from "../src/agent/stepContext.js";
import type { StepExecutionOutcome } from "../src/agent/stepContext.js";
import type { ExecutionPlanStep } from "../src/agent/smartPlanner.js";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";

const plan: ExecutionPlanStep[] = [
  { id: "locate", task: "Find official docs", depends_on: [], parallel_safe: true },
  { id: "backends", task: "List backends", depends_on: ["locate"], parallel_safe: true },
  { id: "neon", task: "Evaluate Neon", depends_on: ["backends"], parallel_safe: true },
  { id: "recommend", task: "Recommend architecture", depends_on: ["neon"], parallel_safe: false, completion_criteria: ["Compare operational complexity and compatibility evidence"] },
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
  assert.match(serialized, /Compare operational complexity and compatibility evidence/);
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


test("rolling compaction bounds the next-turn prompt and preserves prior evidence", () => {
  const stepStart = 3;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: "Stable instructions" },
    { role: "user", content: "Original request" },
    { role: "system", content: "Current step instruction" },
    { role: "assistant", content: "I found the official source." },
    { role: "tool", tool_call_id: "tool-1", content: "A".repeat(12_000) }
  ];
  const first = compactStepConversation(messages, stepStart, { observations: [], assistantNotes: [] });
  assert.equal(first.observations.length, 1);
  assert.equal(first.observations[0]?.tool_call_id, "tool-1");
  assert.equal(first.assistantNotes[0], "I found the official source.");
  assert.equal(messages.length, 4);
  assert.ok(JSON.stringify(messages).length < 5_000);
  assert.match(JSON.stringify(messages), /Original request/);

  messages.push(
    { role: "assistant", content: "The second source confirms the detail." },
    { role: "tool", tool_call_id: "tool-2", content: "Second source result" }
  );
  const second = compactStepConversation(messages, stepStart, first);
  assert.deepEqual(second.observations.map((item) => item.tool_call_id), ["tool-1", "tool-2"]);
  assert.ok(second.assistantNotes.includes("I found the official source."));
  assert.ok(second.assistantNotes.includes("The second source confirms the detail."));
});
