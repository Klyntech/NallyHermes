/**
 * Repair dependency over-chaining in read-only research plans.
 *
 * A read-only step is independent unless its task explicitly consumes an
 * artifact from another step. Contextual relationships become soft links;
 * unrelated research edges are removed so they can execute independently.
 */
export interface ResearchDependencyStep {
  id: string;
  task: string;
  depends_on: string[];
  context_from?: string[];
  parallel_safe: boolean;
}

export function normalizeResearchDependencies<T extends ResearchDependencyStep>(steps: T[]): T[] {
  const byId = new Map(steps.map((step) => [step.id, step]));
  return steps.map((step) => {
    if (!step.parallel_safe || !step.depends_on.length) return step;
    const hard: string[] = [];
    const contextual = [...(step.context_from ?? [])];
    for (const dependencyId of step.depends_on) {
      const dependency = byId.get(dependencyId);
      if (!dependency || !dependency.parallel_safe) {
        hard.push(dependencyId);
        continue;
      }
      const task = step.task;
      const consumesArtifact =
        /\b(?:url|page|file|document|endpoint|output|result)\s+(?:identified|found|returned|discovered|created|produced)\b/i.test(task) ||
        /\b(?:identified|found|returned|discovered|created|produced)\s+(?:url|page|file|document|endpoint)\b/i.test(task) ||
        /\b(?:fetch|read|open)\b.*\b(?:linked|referenced|listed|returned)\s+(?:by|in|from)\b/i.test(task);
      const usesContext =
        /\b(?:compare|cross[- ]check|validate|verify|extend|follow[- ]up|based on|using|in light of|consistent with)\b/i.test(task);
      if (consumesArtifact) hard.push(dependencyId);
      else if (usesContext) contextual.push(dependencyId);
      // Otherwise the research step is independent; do not serialize it.
    }
    return {
      ...step,
      depends_on: hard,
      context_from: [...new Set(contextual)].filter((id) => !hard.includes(id))
    };
  });
}
