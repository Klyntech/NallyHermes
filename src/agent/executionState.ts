import type { ExecutionPlanStep } from "./smartPlanner.js";

/**
 * Deterministically validates and topologically orders a proposed execution
 * graph. Returns null for malformed references, duplicate IDs, or cycles.
 */
export function orderPlanSteps(steps: readonly ExecutionPlanStep[]): ExecutionPlanStep[] | null {
  if (!steps.length) return null;

  const ids = new Set<string>();
  for (const step of steps) {
    if (!step.id || ids.has(step.id)) return null;
    ids.add(step.id);
  }

  for (const step of steps) {
    if (new Set(step.depends_on).size !== step.depends_on.length) return null;
    if (step.depends_on.some((id) => id === step.id || !ids.has(id))) return null;
  }

  const ordered: ExecutionPlanStep[] = [];
  const completed = new Set<string>();
  while (ordered.length < steps.length) {
    const ready = steps.filter((step) =>
      !completed.has(step.id) && step.depends_on.every((dependency) => completed.has(dependency))
    );
    if (!ready.length) return null;
    for (const step of ready) {
      ordered.push(step);
      completed.add(step.id);
    }
  }
  return ordered;
}

/**
 * Select failed prerequisites that are ancestors of currently pending work.
 * This prevents recovery attempts being spent on unrelated failed branches.
 */
export function getRecoverablePrerequisites(
  steps: readonly ExecutionPlanStep[],
  pendingIds: ReadonlySet<string>,
  failedIds: ReadonlySet<string>
): ExecutionPlanStep[] {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const required = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const step = byId.get(id);
    if (!step) return;
    for (const dependency of step.depends_on) {
      required.add(dependency);
      visit(dependency);
    }
  };
  for (const id of pendingIds) visit(id);
  return steps.filter((step) => required.has(step.id) && failedIds.has(step.id));
}

/** Return pending steps whose prerequisites have all completed. */
export function getReadyPlanSteps(
  steps: readonly ExecutionPlanStep[],
  completedIds: ReadonlySet<string>,
  pendingIds: ReadonlySet<string>
): ExecutionPlanStep[] {
  return steps.filter((step) =>
    pendingIds.has(step.id) && step.depends_on.every((dependency) => completedIds.has(dependency))
  );
}

export interface StepEvidence {
  observations: Array<{ tool_call_id: string; content: string }>;
  assistantNotes: string[];
}

interface EvidenceMessage {
  role: string;
  tool_call_id?: string;
  content?: unknown;
}

/** Collect only evidence in the supplied step-local message slice. */
export function collectStepEvidence(messages: readonly EvidenceMessage[]): StepEvidence {
  const observations = messages
    .filter((message) => message.role === "tool")
    .slice(-8)
    .map((message) => ({
      tool_call_id: message.tool_call_id ?? "unknown",
      content: typeof message.content === "string" ? message.content.slice(0, 4_000) : "[non-text tool result]"
    }));
  const assistantNotes = messages
    .filter((message) => message.role === "assistant" && typeof message.content === "string" && message.content.trim())
    .slice(-4)
    .map((message) => (message.content as string).slice(0, 4_000));
  return { observations, assistantNotes };
}
