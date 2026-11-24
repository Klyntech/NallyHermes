/**
 * Self-improvement / learning loop foundations.
 *
 * This module is the Nally equivalent of Hermes' closed learning loop:
 * observe multi-step work → optionally distill a reusable skill →
 * surface the proposal for explicit user approval → activate only after acceptance.
 *
 * All mutations remain behind the existing approval gates.
 */

export type {
  TrajectoryDomain,
  TrajectoryOutcome,
  LearnedSkillStatus,
  TrajectoryStep,
  TrajectoryRecord,
  LearnedSkillRecord,
  SkillProposal
} from "./types.js";

/**
 * Heuristic: a trajectory is a candidate for skill distillation when it
 * succeeded, used more than one tool step, and is not a pure conversation turn.
 */
export function isReusableTrajectory(steps: Array<{ tool?: string; success: boolean }>, outcome: string): boolean {
  if (outcome !== "success") return false;
  const toolSteps = steps.filter((s) => s.tool && s.success);
  return toolSteps.length >= 2;
}

/**
 * Very light domain tagging based on request text.
 * Later this will be replaced / augmented by the Agency Graph context.
 */
export function inferDomains(requestSummary: string): Array<"law" | "code" | "trading" | "cross" | "general"> {
  const text = requestSummary.toLowerCase();
  const domains = new Set<"law" | "code" | "trading" | "cross" | "general">();

  if (/\b(case|statute|tort|contract|jurisdiction|bar exam|lecture|course|assessment|pupillage)\b/.test(text)) {
    domains.add("law");
  }
  if (/\b(code|repo|pr|pull request|typescript|react|api|deploy|bug|feature|side.?project)\b/.test(text)) {
    domains.add("code");
  }
  if (/\b(trade|trading|strategy|backtest|position|drawdown|portfolio|edge|regime)\b/.test(text)) {
    domains.add("trading");
  }

  if (domains.size === 0) domains.add("general");
  if (domains.size > 1) domains.add("cross");

  return [...domains];
}
