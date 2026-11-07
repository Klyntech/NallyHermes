import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { config } from "../config.js";
import type { ModelCallTelemetry } from "./modelTelemetry.js";
import { orderPlanSteps } from "./executionState.js";
import { normalizeResearchDependencies } from "./researchDependencies.js";

export interface ExecutionPlanStep {
  id: string;
  task: string;
  depends_on: string[];
  /** Soft evidence links: wait for these steps to settle, but continue if they are partial/failed. */
  context_from?: string[];
  parallel_safe: boolean;
  completion_criteria?: string[];
}

export interface ExecutionPlan {
  reason: string;
  steps: ExecutionPlanStep[];
}

const MAX_PLAN_STEPS = 10;
const MAX_TASK_LENGTH = 500;
const MAX_COMPLETION_CRITERIA = 5;

function extractJson(value: string): unknown {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as unknown;
}


/** Ask the model whether explicit decomposition is useful, and validate its plan deterministically. */
export async function createExecutionPlan(
  llm: OpenAI,
  history: ChatCompletionMessageParam[],
  userMessage: string,
  telemetry?: ModelCallTelemetry
): Promise<ExecutionPlan | null> {
  const plannerMessages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "You are Nally's task planner. Decide whether the user's request genuinely requires multiple dependent or independently executable steps.",
        "Simple questions, explanations, calculations, single searches, and single actions do not need a plan.",
        "If no plan is needed, return exactly JSON: {\"needs_plan\":false,\"reason\":\"brief reason\",\"steps\":[]}.",
        "If a plan is needed, return JSON only matching this shape: {\"needs_plan\":true,\"reason\":\"...\",\"steps\":[{\"id\":\"step_1\",\"task\":\"...\",\"depends_on\":[],\"context_from\":[],\"parallel_safe\":true,\"completion_criteria\":[\"...\"]}]}. Each step must include all six fields, including 1–5 concrete, observable completion_criteria that describe what evidence or result makes that step finished.",
        "Create the minimum number of steps needed, between 2 and 10. Do not split work into redundant research steps. Plan only information or actions required by the request; stop the plan once sufficient evidence will be available. Reuse results from earlier steps instead of repeating work. Use unique step IDs. Use depends_on only for hard prerequisites: the step cannot be meaningfully executed without successful completion of that prerequisite. Use context_from for related research whose evidence is useful but not essential; these steps wait for the referenced step to settle, then still execute if it is partial or failed. Do not create artificial chains or make every research step depend on locating the documentation first; independent research tasks should have empty depends_on and context_from. Both arrays must reference step IDs. Include parallel_safe as a boolean; set true only for independent read-only work (web search, fetch, file read/grep/list, memory recall, schedule list). Set false for any write, edit, delete, memory mutation, or schedule creation/cancellation.",
        "Do not include markdown, code fences, commentary, or extra keys."
      ].join("\n")
    },
    ...history.filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string").slice(-8),
    { role: "user", content: userMessage }
  ];
  const request = () => llm.chat.completions.create({
    model: config.NVIDIA_NIM_MODEL,
    messages: plannerMessages,
    temperature: 0.1
  }, { timeout: config.AGENT_MODEL_TIMEOUT_MS });
  const response = telemetry
    ? await telemetry.run({
        phase: "planning",
        reason: "classify_request_and_create_execution_plan",
        model: config.NVIDIA_NIM_MODEL,
        contextMode: "bounded_history",
        messages: plannerMessages
      }, request)
    : await request();

  const raw = response.choices[0]?.message?.content;
  if (!raw) return null;

  try {
    const parsed = extractJson(raw) as {
      needs_plan?: unknown;
      reason?: unknown;
      steps?: unknown;
    };
    if (parsed.needs_plan !== true || !Array.isArray(parsed.steps)) return null;
    if (parsed.steps.length < 2 || parsed.steps.length > MAX_PLAN_STEPS) return null;

    const steps: ExecutionPlanStep[] = [];
    const ids = new Set<string>();
    for (const item of parsed.steps) {
      if (!item || typeof item !== "object") return null;
      const step = item as Record<string, unknown>;
      if (typeof step.id !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(step.id) || ids.has(step.id)) return null;
      if (typeof step.task !== "string" || !step.task.trim() || step.task.length > MAX_TASK_LENGTH) return null;
      if (!Array.isArray(step.depends_on) || !step.depends_on.every((id) => typeof id === "string")) return null;
      const contextFrom = step.context_from === undefined ? [] : step.context_from;
      if (!Array.isArray(contextFrom) || !contextFrom.every((id) => typeof id === "string")) return null;
      if (typeof step.parallel_safe !== "boolean") return null;
      const criteria = Array.isArray(step.completion_criteria)
        ? step.completion_criteria
        : [step.task.trim()];
      if (criteria.length < 1 || criteria.length > MAX_COMPLETION_CRITERIA ||
          !criteria.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 240)) return null;
      ids.add(step.id);
      steps.push({
        id: step.id,
        task: step.task.trim(),
        depends_on: step.depends_on as string[],
        context_from: contextFrom as string[],
        parallel_safe: step.parallel_safe,
        completion_criteria: (criteria as string[]).map((item) => item.trim())
      });
    }

    // The shared deterministic graph validator rejects unknown dependencies,
    // self-links, duplicate edges, and cycles before execution can begin.
    const normalizedSteps = normalizeResearchDependencies(steps);
    const ordered = orderPlanSteps(normalizedSteps);
    if (!ordered) return null;

    return {
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 240) : "Multi-step request",
      steps: ordered
    };
  } catch {
    // A malformed or unsupported planning response safely falls back to the normal agent loop.
    return null;
  }
}
