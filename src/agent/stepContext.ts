import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import type { ExecutionPlanStep } from "./smartPlanner.js";
import { collectStepEvidence, type StepEvidence } from "./executionState.js";

export interface StepExecutionOutcome {
  id: string;
  task: string;
  status: "completed" | "partial" | "failed" | "blocked";
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
    if (dependency) {
      for (const parent of dependency.depends_on) visit(parent);
      for (const parent of dependency.context_from ?? []) visit(parent);
    }
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
        "Do not assume unrelated steps have run. Distinguish hard prerequisites from contextual evidence: a partial/failed context source may still contain useful observations, but never claim it succeeded.",
        JSON.stringify(sharedState)
      ].join("\n\n")
    });
  }
  messages.push({
    role: "system",
    content: [
      `Execute this plan step now: ${step.task}`,
      "Completion criteria (each must be satisfied or explicitly marked unresolved):",
      ...(step.completion_criteria ?? [step.task]).map((criterion, index) => `${index + 1}. ${criterion}`),
      "Use the available tools when needed. Do not attempt later steps.",
      "When this step is complete, give a concise factual result for this step only and explicitly state whether each completion criterion was met.",
      "Assess whether the evidence already collected is sufficient for this step. Stop as soon as it is; do not keep researching for completeness.",
      "Reuse prerequisite results supplied in the shared state. Seek more information only to resolve a specific necessary gap.",
      "If a tool fails, inspect the error and adapt the method instead of repeating the same call blindly. Never repeat a mutation as a retry.",
      "Verify important findings using available evidence, but do not perform redundant checks.",
      "If blocked, explain what is missing instead of claiming success."
    ].join("\n")
  });
  return messages;
}


export function mergeStepEvidence(previous: StepEvidence, next: StepEvidence): StepEvidence {
  const observations = new Map<string, StepEvidence["observations"][number]>();
  for (const item of [...previous.observations, ...next.observations]) {
    observations.set(item.tool_call_id, item);
  }
  return {
    observations: [...observations.values()].slice(-8),
    assistantNotes: [...previous.assistantNotes, ...next.assistantNotes].slice(-4)
  };
}

/** Collapse completed tool-call turns into a bounded evidence summary. */
export function compactStepConversation(
  messages: ChatCompletionMessageParam[],
  stepMessageStart: number,
  previousEvidence: StepEvidence
): StepEvidence {
  const currentEvidence = collectStepEvidence(messages.slice(stepMessageStart));
  const accumulated = mergeStepEvidence(previousEvidence, currentEvidence);
  messages.splice(stepMessageStart);
  messages.push({
    role: "system",
    content: [
      "Bounded evidence collected so far in this step. Reuse it and do not repeat completed tool calls unless a specific necessary gap remains.",
      JSON.stringify({
        observations: accumulated.observations.slice(-4).map((item) => ({
          tool_call_id: item.tool_call_id,
          content: item.content.slice(0, 1_800)
        })),
        assistantNotes: accumulated.assistantNotes.slice(-2).map((note) => note.slice(0, 1_000))
      })
    ].join("\n\n")
  });
  return accumulated;
}
