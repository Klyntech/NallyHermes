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
