import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import type { ExecutionPlanStep } from "./smartPlanner.js";
import type { StepEvidence } from "./executionState.js";

export interface StepExecutionOutcome {
  id: string;
  task: string;
  status: "completed" | "partial" | "failed";
  toolRounds: number;
  answer: string;
  evidence: StepEvidence;
  failureReason?: string;
}

const MAX_SHARED_STATE_CHARS = 24_000;

/** Keep the original request, plus bounded results from this step's prerequisite chain only. */
export function buildStepContext(
  baseMessages: readonly ChatCompletionMessageParam[],
  step: ExecutionPlanStep,
  plan: readonly ExecutionPlanStep[],
  outcomes: readonly StepExecutionOutcome[]
): ChatCompletionMessageParam[] {
  const byId = new Map(plan.map((item) => [item.id, item]));
  const ancestors = new Set<string>();
  const visit = (id: string): void => {
    if (ancestors.has(id)) return;
    ancestors.add(id);
    const dependency = byId.get(id);
    if (dependency) for (const parent of dependency.depends_on) visit(parent);
  };
  for (const dependency of step.depends_on) visit(dependency);

  const relevant = plan
    .filter((item) => ancestors.has(item.id))
    .map((item) => outcomes.find((outcome) => outcome.id === item.id))
    .filter((item): item is StepExecutionOutcome => Boolean(item));

  const sharedState: Array<Record<string, unknown>> = [];
  let remaining = MAX_SHARED_STATE_CHARS;
  for (const outcome of relevant) {
    if (remaining < 300) break;
    const answer = outcome.answer.slice(0, Math.min(2_000, remaining));
    remaining -= answer.length;
    const observations: StepEvidence["observations"] = [];
    for (const observation of outcome.evidence.observations.slice(-2)) {
      if (remaining < 250) break;
      const content = observation.content.slice(0, Math.min(900, remaining - 100));
      observations.push({ tool_call_id: observation.tool_call_id, content });
      remaining -= content.length + observation.tool_call_id.length + 40;
    }
    const assistantNotes: string[] = [];
    for (const note of outcome.evidence.assistantNotes.slice(-1)) {
      if (remaining < 200) break;
      const bounded = note.slice(0, Math.min(500, remaining - 100));
      assistantNotes.push(bounded);
      remaining -= bounded.length + 20;
    }
    const entry = {
      step_id: outcome.id,
      task: outcome.task.slice(0, 250),
      status: outcome.status,
      answer,
      evidence: { observations, assistantNotes },
      ...(outcome.failureReason ? { limitation: outcome.failureReason.slice(0, 400) } : {})
    };
    sharedState.push(entry);
    remaining -= JSON.stringify(entry).length - answer.length -
      observations.reduce((sum, item) => sum + item.content.length, 0) -
      assistantNotes.reduce((sum, item) => sum + item.length, 0);
  }

  const messages: ChatCompletionMessageParam[] = [...baseMessages];
  if (sharedState.length) {
    messages.push({
      role: "system",
      content: [
        "Relevant prerequisite results for the current plan step are provided below.",
        "Treat these as existing evidence and reuse them. Do not repeat completed research unless a specific necessary gap remains.",
        "Do not assume unrelated steps have run. Do not claim a prerequisite succeeded if its status is partial or failed.",
        JSON.stringify(sharedState)
      ].join("\n\n")
    });
  }
  messages.push({
    role: "system",
    content: [
      `Execute this plan step now: ${step.task}`,
      "Use the available tools when needed. Do not attempt later steps.",
      "When this step is complete, give a concise factual result for this step only.",
      "Assess whether the evidence already collected is sufficient for this step. Stop as soon as it is; do not keep researching for completeness.",
      "Reuse prerequisite results supplied in the shared state. Seek more information only to resolve a specific necessary gap.",
      "If a tool fails, inspect the error and adapt the method instead of repeating the same call blindly. Never repeat a mutation as a retry.",
      "Verify important findings using available evidence, but do not perform redundant checks.",
      "If blocked, explain what is missing instead of claiming success."
    ].join("\n")
  });
  return messages;
}
