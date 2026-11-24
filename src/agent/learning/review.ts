import { isReusableTrajectory, inferDomains } from "./index.js";
import { proposeLearnedSkill } from "./store.js";
import type { TrajectoryDomain, TrajectoryStep } from "./types.js";

/**
 * After a successful multi-step trajectory, build a lightweight skill proposal
 * and persist it as status=proposed. Activation still requires explicit accept
 * via skill_manage (approval-gated).
 *
 * This is intentionally heuristic — not an LLM call — so it stays cheap and
 * never blocks the response path. A later pass can upgrade the body writer.
 */
export function maybeProposeSkillFromTrajectory(input: {
  telegramId: string;
  trajectoryId: string;
  requestSummary: string;
  steps: TrajectoryStep[];
  outcome: string;
}): void {
  if (!isReusableTrajectory(input.steps, input.outcome)) return;

  const domains = inferDomains(input.requestSummary);
  const primaryDomain: TrajectoryDomain =
    domains.find((d) => d !== "cross" && d !== "general") ?? domains[0] ?? "general";

  const toolNames = [...new Set(input.steps.map((s) => s.tool).filter(Boolean))] as string[];
  const name = deriveSkillName(primaryDomain, toolNames, input.requestSummary);
  const description = deriveDescription(input.requestSummary, toolNames);
  const body = buildSkillBody({
    name,
    description,
    domain: primaryDomain,
    requestSummary: input.requestSummary,
    steps: input.steps
  });

  void proposeLearnedSkill(input.telegramId, {
    name,
    description,
    body,
    domain: primaryDomain,
    sourceTrajectoryId: input.trajectoryId,
    rationale: `Auto-proposed after reusable trajectory (${input.steps.length} steps, tools: ${toolNames.join(", ") || "none"}).`
  }).catch((error) => {
    console.warn(
      "skill proposal from trajectory failed:",
      error instanceof Error ? error.message : error
    );
  });
}

function deriveSkillName(domain: string, tools: string[], summary: string): string {
  const base = domain === "general" ? "workflow" : domain;
  const toolHint = tools[0]?.replace(/_/g, "-") ?? "multi-step";
  const token =
    summary
      .toLowerCase()
      .match(/[a-z][a-z0-9-]{3,}/)?.[0]
      ?.slice(0, 24) ?? "task";
  const raw = `${base}-${toolHint}-${token}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return raw || `learned-${Date.now().toString(36)}`;
}

function deriveDescription(summary: string, tools: string[]): string {
  const clipped = summary.trim().replace(/\s+/g, " ").slice(0, 160);
  const toolPart = tools.length ? ` Uses: ${tools.join(", ")}.` : "";
  return `Reusable procedure distilled from: ${clipped}.${toolPart}`;
}

function buildSkillBody(input: {
  name: string;
  description: string;
  domain: string;
  requestSummary: string;
  steps: TrajectoryStep[];
}): string {
  const stepLines = input.steps
    .map((s, i) => `${i + 1}. ${s.success ? "✓" : "✗"} ${s.summary}`)
    .join("\n");

  return [
    "---",
    `name: ${input.name}`,
    `description: ${JSON.stringify(input.description)}`,
    "---",
    "",
    `# ${input.name}`,
    "",
    `Domain: **${input.domain}**`,
    "",
    "## When to use",
    input.requestSummary.trim().slice(0, 400),
    "",
    "## Observed procedure",
    stepLines || "(no tool steps recorded)",
    "",
    "## Guidance",
    "- Prefer this sequence when a similar request appears.",
    "- Re-verify facts; do not treat prior tool output as still current.",
    "- Respect approval gates for any mutating step.",
    "- If the environment or constraints differ, adapt rather than force this path.",
    ""
  ].join("\n");
}
