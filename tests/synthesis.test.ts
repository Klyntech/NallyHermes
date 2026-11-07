import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSynthesisEvidencePackage,
  buildSynthesisMessages,
  enforceCompletionDisclosure
} from "../src/agent/synthesis.js";
import type { StepExecutionOutcome } from "../src/agent/stepContext.js";
import type { ExecutionPlanStep } from "../src/agent/smartPlanner.js";

const plan: ExecutionPlanStep[] = [
  { id: "docs", task: "Find official docs", depends_on: [], parallel_safe: true, completion_criteria: ["Identify official documentation", "Retrieve storage backend matrix"] },
  { id: "neon", task: "Verify Neon compatibility", depends_on: ["docs"], parallel_safe: true, completion_criteria: ["Verify Neon extension compatibility"] }
];

const outcome = (id: string, status: StepExecutionOutcome["status"]): StepExecutionOutcome => ({
  id, task: plan.find((step) => step.id === id)!.task, status, toolRounds: 1,
  answer: status === "completed" ? "Official documentation identified." : "Could not verify compatibility.",
  evidence: { observations: [{ tool_call_id: id + "_call", content: "Source excerpt https://example.org/docs with verified details." }], assistantNotes: [] },
  ...(status === "completed" ? {} : { failureReason: "The source page could not be retrieved." })
});

test("evidence package maps plan criteria to source evidence without claiming proof", () => {
  const pkg = buildSynthesisEvidencePackage(
    [{ role: "user", content: "Research official docs and Neon compatibility." }],
    [outcome("docs", "completed"), outcome("neon", "partial")],
    plan, 2, "One step remained unresolved."
  );
  assert.equal(pkg.schema_version, 1);
  assert.equal(pkg.execution.status, "partial_or_incomplete");
  assert.equal(pkg.claims.length, 3);
  assert.equal(pkg.claims[0]?.status, "candidate");
  assert.equal(pkg.claims[2]?.status, "unresolved");
  assert.deepEqual(pkg.sources[0]?.urls, ["https://example.org/docs"]);
  assert.equal(pkg.user_request, "Research official docs and Neon compatibility.");
});

test("synthesis messages contain evidence contract, not raw tool transcript", () => {
  const pkg = buildSynthesisEvidencePackage(
    [{ role: "user", content: "Find sources." }, { role: "tool", tool_call_id: "raw", content: "raw transcript" }],
    [outcome("docs", "completed")], plan, 1, "Done"
  );
  const messages = buildSynthesisMessages(pkg);
  const serialized = JSON.stringify(messages);
  assert.match(serialized, /claims ledger/);
  assert.match(serialized, /https:\/\/example.org\/docs/);
  assert.doesNotMatch(serialized, /raw transcript/);
});

test("incomplete execution receives deterministic disclosure if model omits it", () => {
  const pkg = buildSynthesisEvidencePackage(
    [{ role: "user", content: "Research." }],
    [outcome("docs", "completed"), outcome("neon", "blocked")],
    plan, 2, "Prerequisite did not complete."
  );
  const answer = enforceCompletionDisclosure("Here are the verified findings.", pkg);
  assert.match(answer, /Execution status: PARTIAL/);
  assert.match(answer, /Verify Neon extension compatibility/);
  assert.equal(enforceCompletionDisclosure("This report is incomplete.", pkg), "This report is incomplete.");
});

test("completed execution does not receive a partial warning", () => {
  const pkg = buildSynthesisEvidencePackage(
    [{ role: "user", content: "Research." }],
    [outcome("docs", "completed")], plan, 1, "Done"
  );
  assert.equal(enforceCompletionDisclosure("Finished report.", pkg), "Finished report.");
});
