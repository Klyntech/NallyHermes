import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import type { StepEvidence } from "./executionState.js";
import type { StepExecutionOutcome } from "./stepContext.js";
import type { ExecutionPlanStep } from "./smartPlanner.js";

export type ClaimEvidenceStatus = "candidate" | "unresolved";

export interface SynthesisClaim {
  id: string;
  step_id: string;
  claim: string;
  status: ClaimEvidenceStatus;
  evidence_ids: string[];
}

export interface SynthesisSource {
  id: string;
  step_id: string;
  tool_call_id: string;
  urls: string[];
  excerpt: string;
}

export interface SynthesisEvidencePackage {
  schema_version: 1;
  execution: {
    status: "complete" | "partial_or_incomplete";
    total_steps: number;
    completed_steps: number;
    partial_steps: number;
    failed_steps: number;
    blocked_steps: number;
    stop_reason: string;
  };
  user_request: string;
  claims: SynthesisClaim[];
  sources: SynthesisSource[];
  step_results: Array<{
    step_id: string;
    task: string;
    status: StepExecutionOutcome["status"];
    answer: string;
    failure_reason?: string;
  }>;
}

const MAX_PACKAGE_CHARS = 48_000;
const MAX_EXCERPT_CHARS = 2_800;
const URL_PATTERN = /https?:\/\/[^\s"'<>[\])}]+/g;

function extractUrls(value: string): string[] {
  return [...new Set((value.match(URL_PATTERN) ?? []).map((url) => url.replace(/[.,;]+$/, "")))].slice(0, 12);
}

function latestUserRequest(messages: readonly ChatCompletionMessageParam[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role === "user" && typeof message.content === "string") return message.content;
  }
  return "Original user request was not available in the synthesis context.";
}

/** Build a bounded, channel-neutral evidence contract for the synthesis engine. */
export function buildSynthesisEvidencePackage(
  messages: readonly ChatCompletionMessageParam[],
  outcomes: readonly StepExecutionOutcome[],
  plan: readonly ExecutionPlanStep[],
  totalSteps: number,
  stopReason: string
): SynthesisEvidencePackage {
  const planById = new Map(plan.map((step) => [step.id, step]));
  const sources: SynthesisSource[] = [];
  const claims: SynthesisClaim[] = [];
  const stepResults = outcomes.map((outcome) => {
    const criteria = planById.get(outcome.id)?.completion_criteria ?? [outcome.task];
    for (let index = 0; index < criteria.length; index++) {
      claims.push({
        id: `${outcome.id}:claim_${index + 1}`,
        step_id: outcome.id,
        claim: criteria[index]!,
        status: outcome.status === "completed" ? "candidate" : "unresolved",
        evidence_ids: outcome.evidence.observations.map((item) => item.tool_call_id)
      });
    }
    for (const observation of outcome.evidence.observations) {
      sources.push({
        id: observation.tool_call_id,
        step_id: outcome.id,
        tool_call_id: observation.tool_call_id,
        urls: extractUrls(observation.content),
        excerpt: observation.content.slice(0, MAX_EXCERPT_CHARS)
      });
    }
    return {
      step_id: outcome.id,
      task: outcome.task,
      status: outcome.status,
      answer: outcome.answer.slice(0, 3_000),
      ...(outcome.failureReason ? { failure_reason: outcome.failureReason.slice(0, 500) } : {})
    };
  });

  // Direct mode has no plan outcomes; retain only bounded tool evidence from its
  // transcript and never copy the full model conversation into synthesis.
  if (!outcomes.length) {
    for (const message of messages) {
      if (message.role !== "tool" || typeof message.content !== "string") continue;
      const id = "direct_source_" + (sources.length + 1);
      sources.push({
        id,
        step_id: "direct",
        tool_call_id: id,
        urls: extractUrls(message.content),
        excerpt: message.content.slice(0, MAX_EXCERPT_CHARS)
      });
    }
  }

  const completed = outcomes.filter((item) => item.status === "completed").length;
  const partial = outcomes.filter((item) => item.status === "partial").length;
  const failed = outcomes.filter((item) => item.status === "failed").length;
  const blocked = outcomes.filter((item) => item.status === "blocked").length;
  const pkg: SynthesisEvidencePackage = {
    schema_version: 1,
    execution: {
      status: outcomes.length === totalSteps && outcomes.every((item) => item.status === "completed")
        ? "complete" : "partial_or_incomplete",
      total_steps: totalSteps,
      completed_steps: completed,
      partial_steps: partial,
      failed_steps: failed,
      blocked_steps: blocked,
      stop_reason: stopReason
    },
    user_request: latestUserRequest(messages).slice(0, 8_000),
    claims,
    sources,
    step_results: stepResults
  };

  // Deterministic whole-package budget: preserve the request and status ledger,
  // then bound source excerpts before dropping lower-priority source entries.
  while (JSON.stringify(pkg).length > MAX_PACKAGE_CHARS && pkg.sources.length) {
    const largest = pkg.sources.reduce((best, item, index, all) =>
      item.excerpt.length > all[best]!.excerpt.length ? index : best, 0);
    const source = pkg.sources[largest]!;
    if (source.excerpt.length > 500) source.excerpt = source.excerpt.slice(0, Math.max(500, Math.floor(source.excerpt.length * 0.7)));
    else pkg.sources.splice(largest, 1);
  }
  return pkg;
}

/** Create the single synthesis request from the evidence contract, not raw execution history. */
export function buildSynthesisMessages(pkg: SynthesisEvidencePackage): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: [
        "You are Nally's evidence-grounded synthesis engine.",
        "Treat the supplied JSON as the complete evidence boundary. Do not assume facts that are not present.",
        "First work through the claims ledger: for each claim, decide supported, partially_supported, unsupported, or conflicting. A candidate status is not proof; cite the source IDs and URLs that directly support it.",
        "Do not treat a completed step as proof by itself. Verify each claim against its actual excerpts and step answer.",
        "Produce the requested deliverable in a clear, useful structure. Cover every part of the original user request that evidence supports.",
        "Use source links inline where available. Never invent URLs, source titles, versions, configuration values, or compatibility guarantees.",
        "Separate documented facts, reasoned recommendations, and unknowns. Explain conflicts rather than choosing silently.",
        "If execution is partial_or_incomplete, label the report PARTIAL, identify the exact unresolved claims and blocked/failed steps, and do not imply the research is complete.",
        "If evidence is sufficient despite a non-critical failed step, use it and explain only limitations that affect confidence.",
        "Finish with a concise coverage statement: covered requirements, unresolved requirements, and what evidence would close each gap."
      ].join("\n")
    },
    { role: "user", content: JSON.stringify(pkg) }
  ];
}

/** Enforce a deterministic disclosure when execution did not complete. */
export function enforceCompletionDisclosure(
  answer: string,
  pkg: SynthesisEvidencePackage
): string {
  if (pkg.execution.status === "complete") return answer;
  if (/\b(partial|incomplete|not completed|could not be completed)\b/i.test(answer)) return answer;
  const unresolved = pkg.claims.filter((claim) => claim.status === "unresolved");
  const lines = [
    "## Execution status: PARTIAL",
    `The execution completed ${pkg.execution.completed_steps} of ${pkg.execution.total_steps} planned steps; ${pkg.execution.partial_steps} were partial, ${pkg.execution.failed_steps} failed, and ${pkg.execution.blocked_steps} were blocked.`,
    `Reason: ${pkg.execution.stop_reason}`
  ];
  if (unresolved.length) lines.push("Unresolved requirements: " + unresolved.map((claim) => claim.claim).join("; "));
  return answer.trimEnd() + "\n\n" + lines.join("\n");
}
