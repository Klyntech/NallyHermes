import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { config } from "../config.js";

export interface ExecutionPlanStep {
  id: string;
  task: string;
  depends_on: string[];
  parallel_safe: boolean;
}

export interface ExecutionPlan {
  reason: string;
  steps: ExecutionPlanStep[];
}

const MAX_PLAN_STEPS = 6;
const MAX_TASK_LENGTH = 500;

function extractJson(value: string): unknown {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as unknown;
}

/** Ask the model whether explicit decomposition is useful, and validate its plan deterministically. */
export async function createExecutionPlan(
  llm: OpenAI,
  history: ChatCompletionMessageParam[],
  userMessage: string
): Promise<ExecutionPlan | null> {
  const response = await llm.chat.completions.create({
    model: config.NVIDIA_NIM_MODEL,
    messages: [
      {
        role: "system",
        content: [
          "You are Nally's task planner. Decide whether the user's request genuinely requires multiple dependent or independently executable steps.",
          "Simple questions, explanations, calculations, single searches, and single actions do not need a plan.",
          "If no plan is needed, return exactly JSON: {\"needs_plan\":false,\"reason\":\"brief reason\",\"steps\":[]}.",
          "If a plan is needed, return JSON only: {\"needs_plan\":true,\"reason\":\"brief reason\",\"steps\":[{\"id\":\"step_1\",\"task\":\"specific actionable task\",\"depends_on\":[]}]}.",
          "Create 2 to 6 concise, actionable steps. Use unique step IDs. Dependencies must reference step IDs. Include parallel_safe as a boolean; set true only for independent read-only work (web search, fetch, file read/grep/list, memory recall, schedule list). Set false for any write, edit, delete, memory mutation, or schedule creation/cancellation.",
          "Do not include markdown, code fences, commentary, or extra keys."
        ].join("\n")
      },
      ...history.filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string").slice(-8),
      { role: "user", content: userMessage }
    ],
    temperature: 0.1
  });

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
      if (typeof step.parallel_safe !== "boolean") return null;
      ids.add(step.id);
      steps.push({ id: step.id, task: step.task.trim(), depends_on: step.depends_on as string[], parallel_safe: step.parallel_safe });
    }

    for (const step of steps) {
      if (step.depends_on.some((id) => !ids.has(id) || id === step.id)) return null;
    }

    // Topological sort also rejects cyclic dependencies.
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

    return {
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 240) : "Multi-step request",
      steps: ordered
    };
  } catch {
    // A malformed or unsupported planning response safely falls back to the normal agent loop.
    return null;
  }
}
