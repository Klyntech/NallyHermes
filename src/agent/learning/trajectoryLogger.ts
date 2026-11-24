import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { recordTrajectory } from "./store.js";
import type { TrajectoryOutcome, TrajectoryStep } from "./types.js";

/**
 * Extract high-level tool steps from the conversation message list.
 * Used after a turn finishes so the learning loop can decide whether
 * the work was reusable enough to propose a skill.
 */
export function extractTrajectorySteps(messages: ChatCompletionMessageParam[]): TrajectoryStep[] {
  const steps: TrajectoryStep[] = [];

  for (const message of messages) {
    if (message.role === "assistant") {
      const toolCalls = (message as { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> }).tool_calls;
      if (!toolCalls) continue;
      for (const call of toolCalls) {
        const name = call.function?.name;
        if (!name) continue;
        let summary = name;
        try {
          const args = JSON.parse(call.function?.arguments ?? "{}") as Record<string, unknown>;
          if (typeof args.operation === "string") summary = `${name}.${args.operation}`;
          else if (typeof args.query === "string") summary = `${name}: ${String(args.query).slice(0, 80)}`;
          else if (typeof args.path === "string") summary = `${name}: ${String(args.path).slice(0, 80)}`;
        } catch {
          /* ignore */
        }
        steps.push({ tool: name, summary, success: true });
      }
    }

    if (message.role === "tool") {
      const last = steps[steps.length - 1];
      if (!last) continue;
      try {
        const parsed = JSON.parse(String(message.content)) as { error?: unknown; status?: string };
        if (parsed.error || parsed.status === "needs_approval") {
          last.success = false;
        }
      } catch {
        /* non-JSON tool payload — leave success as-is */
      }
    }
  }

  return steps;
}

function mapOutcome(status: string): TrajectoryOutcome {
  if (status === "completed") return "success";
  if (status === "partial") return "partial";
  return "failed";
}

/**
 * Fire-and-forget trajectory recording.
 * Never throws into the request path; failures are logged only.
 */
export function logTrajectorySafe(input: {
  telegramId: string;
  conversationId?: string | null;
  requestSummary: string;
  messages: ChatCompletionMessageParam[];
  executionStatus: string;
  metadata?: Record<string, unknown>;
}): void {
  const steps = extractTrajectorySteps(input.messages);
  // Skip pure chat turns with no tools — not useful for skill distillation.
  if (steps.length === 0) return;

  void recordTrajectory({
    telegramId: input.telegramId,
    conversationId: input.conversationId,
    requestSummary: input.requestSummary,
    steps,
    outcome: mapOutcome(input.executionStatus),
    metadata: input.metadata
  }).catch((error) => {
    console.warn(
      "trajectory logging failed:",
      error instanceof Error ? error.message : error
    );
  });
}
