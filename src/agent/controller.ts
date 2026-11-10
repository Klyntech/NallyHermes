import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { config } from "../config.js";
import type { ProgressEvent } from "./progress.js";
import { agentTools } from "./definitions.js";
import { prepareRequest } from "./planner.js";
import { executeToolCalls, isReadOnlyCall, type ToolCallInput } from "./executor.js";
import { evaluateTurn, finalResponse, type ModelToolCall } from "./evaluator.js";
import { createExecutionPlan, type ExecutionPlan, type ExecutionPlanStep } from "./smartPlanner.js";
import { beginPhase, completeExecution, createExecutionState, endPhase, routeRequest, summarizeExecution, type ExecutionState } from "./orchestra.js";

const llm = new OpenAI({
  apiKey: config.NVIDIA_NIM_API_KEY,
  baseURL: config.NVIDIA_NIM_BASE_URL
});

type StepOutcome = {
  id: string;
  task: string;
  status: "completed" | "partial" | "failed";
  toolRounds: number;
  answer: string;
  failureReason?: string;
};

function isFunctionCall(call: ModelToolCall): call is Extract<ModelToolCall, { type: "function" }> {
  return call.type === "function";
}

function remainingTime(deadline: number): number {
  return Math.max(1_000, deadline - Date.now());
}

function collectStepEvidence(messages: ChatCompletionMessageParam[]): string {
  const observations = messages
    .filter((message) => message.role === "tool")
    .slice(-8)
    .map((message) => ({
      role: "tool",
      content: typeof message.content === "string" ? message.content.slice(0, 4_000) : "[non-text tool result]"
    }));
  const assistantNotes = messages
    .filter((message) => message.role === "assistant" && typeof message.content === "string" && message.content.trim())
    .slice(-4)
    .map((message) => (message as { content: string }).content.slice(0, 4_000));
  return JSON.stringify({ assistant_notes: assistantNotes, tool_observations: observations });
}

async function runPlannedStep(
  messages: ChatCompletionMessageParam[],
  step: ExecutionPlanStep,
  telegramId: string,
  maxToolRounds: number,
  readOnlyOnly: boolean,
  deadline: number,
  onProgress?: (event: ProgressEvent) => Promise<void> | void,
  allowedTools?: ReadonlySet<string>
): Promise<StepOutcome> {
  messages.push({
    role: "system",
    content: [
      `Execute this plan step now: ${step.task}`,
      "Use the available tools when needed. Do not attempt later steps.",
      "When this step is complete, give a concise factual result for this step only.",
      "Assess whether the evidence already collected is sufficient for this step. Stop as soon as it is; do not keep researching for completeness.",
      "Reuse earlier tool results. Seek more information only to resolve a specific necessary gap.",
      "If a tool fails, inspect the error and adapt the method instead of repeating the same call blindly. Never repeat a mutation as a retry.",
      "Verify important findings using the available evidence, but do not perform redundant checks.",
      "If blocked, explain what is missing instead of claiming success."
    ].join("\n")
  });

  let toolRounds = 0;
  let failureReason = "The step stopped before the model produced a final result.";
  try {
    for (let round = 0; round <= maxToolRounds; round++) {
      if (Date.now() >= deadline) {
        failureReason = "The overall planned-execution time budget was reached.";
        break;
      }
      await onProgress?.({ type: "thinking", phase: "model" });
      const response = await llm.chat.completions.create({
        model: config.NVIDIA_NIM_MODEL,
        messages,
        tools: allowedTools
          ? agentTools.filter((tool) => tool.type === "function" && allowedTools.has(tool.function.name))
          : agentTools,
        tool_choice: "auto",
        temperature: 0.4
      }, { timeout: remainingTime(deadline) });
      const message = response.choices[0]?.message;
      if (!message) {
        failureReason = "The model returned an empty response.";
        break;
      }
      messages.push(message);

      const evaluation = evaluateTurn(message, round, maxToolRounds + 1);
      if (evaluation.kind === "complete") {
        return {
          id: step.id,
          task: step.task,
          status: "completed",
          toolRounds,
          answer: finalResponse(evaluation.answer)
        };
      }
      if (evaluation.kind === "limit_reached") {
        failureReason = "Reached the tool-round limit for this step.";
        break;
      }
      if (evaluation.kind === "empty_turn") {
        failureReason = "The model returned an empty turn.";
        break;
      }

      const functionCalls = evaluation.calls.filter(isFunctionCall);
      if (readOnlyOnly && !functionCalls.every((call) => isReadOnlyCall(call as ToolCallInput))) {
        failureReason = "The step requested a non-read-only tool operation, so it was not executed.";
        break;
      }

      toolRounds++;
      const results = await executeToolCalls(
        functionCalls as ToolCallInput[],
        telegramId,
        onProgress,
        allowedTools
      );
      const resultById = new Map(results.map((result) => [result.tool_call_id, result]));
      let hadToolErrors = false;
      for (const call of evaluation.calls) {
        if (call.type === "function") {
          const result = resultById.get(call.id);
          if (result) {
            messages.push(result);
            try { hadToolErrors ||= Boolean((JSON.parse(String(result.content)) as { error?: unknown }).error); } catch { /* non-JSON tool response */ }
          }
        } else {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: "Unsupported tool call type." })
          });
        }
      }
      if (hadToolErrors) {
        await onProgress?.({ type: "recovery_adjusting" });
        messages.push({
          role: "system",
          content: "One or more tool calls failed. Diagnose the returned error. Continue only if the missing information is necessary; if so, try a materially different safe approach. Do not repeat the same call unless the error is transient. Do not repeat mutations. If the existing evidence is already sufficient, finish with it and disclose any irrelevant failed call only if it affects confidence."
        });
      }
    }
  } catch (error) {
    failureReason = error instanceof Error ? error.message : "Unexpected step execution error.";
  }

  const evidence = collectStepEvidence(messages);
  const hasEvidence = messages.some((message) => message.role === "tool");
  return {
    id: step.id,
    task: step.task,
    status: hasEvidence ? "partial" : "failed",
    toolRounds,
    answer: hasEvidence
      ? "Step did not reach a verified final answer. Available observations: " + evidence
      : "No usable result was produced.",
    failureReason
  };
}

function fallbackReport(outcomes: StepOutcome[], totalSteps: number, reason: string): string {
  const completed = outcomes.filter((item) => item.status === "completed").length;
  const partial = outcomes.filter((item) => item.status === "partial").length;
  const lines = [
    "Execution report",
    `Completed steps: ${completed}/${totalSteps}; partial steps: ${partial}/${totalSteps}.`,
    reason
  ];
  for (const item of outcomes) {
    lines.push(`- ${item.task} — ${item.status}: ${item.answer}`);
    if (item.failureReason) lines.push(`  Limitation: ${item.failureReason}`);
  }
  if (!outcomes.length) lines.push("No verified findings were produced before execution stopped.");
  return lines.join("\n");
}

async function synthesizeReport(
  messages: ChatCompletionMessageParam[],
  outcomes: StepOutcome[],
  totalSteps: number,
  reason: string,
  deadline?: number
): Promise<string> {
  const reportData = {
    execution_status: outcomes.length === totalSteps && outcomes.every((item) => item.status === "completed")
      ? "complete"
      : "partial_or_incomplete",
    completed_steps: outcomes.filter((item) => item.status === "completed").length,
    partial_steps: outcomes.filter((item) => item.status === "partial").length,
    failed_steps: totalSteps - outcomes.filter((item) => item.status !== "failed").length,
    total_steps: totalSteps,
    stop_reason: reason,
    step_results: outcomes
  };
  const reportMessages: ChatCompletionMessageParam[] = [
    ...messages,
    {
      role: "system",
      content: [
        "Produce the best useful report you can for the user's original request using only the execution evidence provided.",
        "First assess whether the evidence already collected is sufficient for the user's actual request. If it is sufficient, use it directly and do not imply that more research was needed.",
        "Do not discard useful results or request more information merely to make the report exhaustive. Prefer the minimum sufficient evidence.",
        "Execution may be incomplete. Synthesize all verified findings, including useful partial observations.",
        "Clearly separate confirmed findings from uncertainty. Identify steps that remain incomplete and explain why when known.",
        "Never invent facts, sources, tool results, or claim unfinished work succeeded.",
        "Do not ask the user to clarify or retry merely because an execution limit was reached. Give the useful report first.",
        JSON.stringify(reportData)
      ].join("\n\n")
    }
  ];
  try {
    const options = { timeout: deadline ? remainingTime(deadline) : config.AGENT_MODEL_TIMEOUT_MS };
    const final = await llm.chat.completions.create({
      model: config.NVIDIA_NIM_MODEL,
      messages: reportMessages,
      temperature: 0.4
    }, options);
    const answer = final.choices[0]?.message?.content;
    if (answer?.trim()) return finalResponse(answer);
  } catch (error) {
    console.warn("Final execution report synthesis failed:", error);
  }
  return fallbackReport(outcomes, totalSteps, reason);
}

async function runPlannedRequest(
  messages: ChatCompletionMessageParam[],
  steps: ExecutionPlanStep[],
  telegramId: string,
  onProgress?: (event: ProgressEvent) => Promise<void> | void,
  allowedTools?: ReadonlySet<string>
): Promise<string> {
  const completed = new Set<string>();
  const outcomes: StepOutcome[] = [];
  const pending = new Set(steps.map((step) => step.id));
  let totalToolRounds = 0;
  const deadline = Date.now() + config.AGENT_PLAN_TIMEOUT_MS;
  let stopReason = "All executable plan steps were processed.";

  while (pending.size) {
    if (Date.now() >= deadline) {
      stopReason = "The overall planned-execution time limit was reached.";
      break;
    }
    const ready = steps.filter((step) =>
      pending.has(step.id) && step.depends_on.every((dependency) => completed.has(dependency))
    );
    if (!ready.length) {
      stopReason = "Some steps could not run because one or more prerequisite steps did not complete.";
      break;
    }

    const remainingBudget = config.AGENT_MAX_PLAN_TOOL_ROUNDS - totalToolRounds;
    if (remainingBudget <= 0) {
      stopReason = "The total planned tool-round budget was reached.";
      break;
    }

    const candidateBatch = ready[0]!.parallel_safe
      ? ready.filter((step) => step.parallel_safe)
      : [ready[0]!];
    const batch = candidateBatch.slice(0, Math.min(
      config.AGENT_MAX_PARALLEL_PLAN_STEPS,
      remainingBudget
    ));
    const perStepBudget = Math.max(1, Math.min(
      config.AGENT_MAX_STEP_TOOL_ROUNDS,
      Math.floor(remainingBudget / batch.length)
    ));

    for (const step of batch) {
      await onProgress?.({
        type: "plan_step_start",
        index: steps.findIndex((item) => item.id === step.id) + 1,
        total: steps.length,
        task: step.task
      });
    }

    const batchOutcomes = await Promise.all(batch.map((step) =>
      runPlannedStep(
        [...messages],
        step,
        telegramId,
        perStepBudget,
        step.parallel_safe,
        deadline,
        onProgress,
        allowedTools
      )
    ));

    for (let i = 0; i < batch.length; i++) {
      const step = batch[i]!;
      const outcome = batchOutcomes[i]!;
      totalToolRounds += outcome.toolRounds;
      pending.delete(step.id);
      outcomes.push(outcome);
      const index = steps.findIndex((item) => item.id === step.id) + 1;

      if (outcome.status === "completed") {
        completed.add(step.id);
        messages.push({
          role: "assistant",
          content: `Completed plan step ${step.id}: ${outcome.answer}`
        });
        await onProgress?.({ type: "plan_step_complete", index, total: steps.length });
      } else {
        messages.push({
          role: "assistant",
          content: `Plan step ${step.id} was ${outcome.status}: ${outcome.answer}. Limitation: ${outcome.failureReason ?? "Not completed"}`
        });
        await onProgress?.({ type: "plan_step_failed", index, total: steps.length });
      }
    }
  }

  if (pending.size) {
    for (const step of steps.filter((item) => pending.has(item.id))) {
      const blocked = step.depends_on.some((dependency) => !completed.has(dependency));
      outcomes.push({
        id: step.id,
        task: step.task,
        status: "failed",
        toolRounds: 0,
        answer: "This step was not executed.",
        failureReason: blocked
          ? "A prerequisite step did not complete."
          : stopReason
      });
      await onProgress?.({
        type: "plan_step_failed",
        index: steps.findIndex((item) => item.id === step.id) + 1,
        total: steps.length
      });
    }
  }

  // One bounded replanning pass for failed read-only steps. Mutating steps are
  // deliberately excluded so recovery can never replay a write or deletion.
  let recoveryAttempts = 0;
  for (const step of steps) {
    if (recoveryAttempts >= 2 || Date.now() >= deadline) break;
    if (!step.parallel_safe) continue;
    const outcomeIndex = outcomes.findIndex((item) => item.id === step.id);
    const previous = outcomes[outcomeIndex];
    if (!previous || previous.status === "completed") continue;
    const remainingBudget = config.AGENT_MAX_PLAN_TOOL_ROUNDS - totalToolRounds;
    if (remainingBudget <= 0) break;

    recoveryAttempts++;
    await onProgress?.({ type: "recovery_adjusting" });
    await onProgress?.({
      type: "plan_step_start",
      index: steps.findIndex((item) => item.id === step.id) + 1,
      total: steps.length,
      task: "Revising approach: " + step.task
    });
    const recoveryStep: ExecutionPlanStep = {
      id: `recovery_${step.id}`,
      task: [
        `Recover the unresolved read-only task: ${step.task}`,
        `Previous attempt status: ${previous.status}.`,
        `Previous limitation: ${previous.failureReason ?? "The task did not reach a verified result"}.`,
        "Use the existing evidence in the conversation. Choose a materially different read-only approach only if a necessary information gap remains.",
        "Do not repeat searches or fetches already completed unless there is a clear reason. If the evidence is already sufficient, summarize it without more tool calls."
      ].join(" "),
      depends_on: [],
      parallel_safe: true
    };
    const recoveryBudget = Math.max(1, Math.min(3, config.AGENT_MAX_STEP_TOOL_ROUNDS, remainingBudget));
    const recovered = await runPlannedStep(
      [...messages],
      recoveryStep,
      telegramId,
      recoveryBudget,
      true,
      deadline,
      onProgress,
      allowedTools
    );
    totalToolRounds += recovered.toolRounds;
    if (recovered.status === "completed") {
      outcomes[outcomeIndex] = {
        ...previous,
        status: "completed",
        toolRounds: previous.toolRounds + recovered.toolRounds,
        answer: recovered.answer,
        failureReason: undefined
      };
      await onProgress?.({
        type: "plan_step_complete",
        index: steps.findIndex((item) => item.id === step.id) + 1,
        total: steps.length
      });
    } else {
      outcomes[outcomeIndex] = {
        ...previous,
        toolRounds: previous.toolRounds + recovered.toolRounds,
        answer: previous.answer + "\nRecovery attempt: " + recovered.answer,
        failureReason: recovered.failureReason ?? previous.failureReason
      };
      await onProgress?.({
        type: "plan_step_failed",
        index: steps.findIndex((item) => item.id === step.id) + 1,
        total: steps.length
      });
    }
  }

  await onProgress?.({ type: "verifying" });
  return synthesizeReport(messages, outcomes, steps.length, stopReason, deadline);
}

/**
 * Orchestra controller: model-led planning with bounded execution, preserved
 * partial evidence, and a final synthesis pass even when execution is incomplete.
 */
export async function runAgent(
  history: ChatCompletionMessageParam[],
  userMessage: string,
  telegramId: string,
  onProgress?: (event: ProgressEvent) => Promise<void> | void,
  workflowAllowedTools?: ReadonlySet<string>
): Promise<string> {
  const route = routeRequest(userMessage);
  const state = createExecutionState(
    { text: userMessage, telegramId, channel: "telegram" },
    route,
    {
      maxModelRounds: config.AGENT_MAX_MODEL_ROUNDS,
      maxToolRounds: config.AGENT_MAX_PLAN_TOOL_ROUNDS,
      maxParallelCalls: config.AGENT_MAX_PARALLEL_TOOL_CALLS,
      deadlineAt: Date.now() + config.AGENT_PLAN_TIMEOUT_MS
    }
  );
  state.status = "running";
  const reportProgress = async (event: ProgressEvent): Promise<void> => {
    if (event.type === "tool_start") state.toolCalls++;
    if (event.type === "tool_error") state.failures++;
    await onProgress?.(event);
  };

  beginPhase(state, "context");
  const { messages } = await prepareRequest(history, userMessage, telegramId);
  endPhase(state, "context");

  await reportProgress({ type: "planning" });
  let plan: ExecutionPlan | null = null;
  if (route.usePlanner) {
    beginPhase(state, "planning");
    try {
      plan = await createExecutionPlan(llm, history, userMessage);
    } catch (error) {
      console.warn("Smart planning unavailable; using direct execution:", error);
    }
    endPhase(state, "planning");
  }

  if (plan) {
    await reportProgress({ type: "plan_created", stepCount: plan.steps.length });
    beginPhase(state, "execution");
    const answer = await runPlannedRequest(messages, plan.steps, telegramId, reportProgress, workflowAllowedTools);
    endPhase(state, "execution");
    completeExecution(state, "completed");
    console.info("orchestra.execution", JSON.stringify({ ...summarizeExecution(state), route: route.reason }));
    await reportProgress({ type: "response_ready" });
    return answer;
  }

  beginPhase(state, "execution");
  let stopReason = "The direct tool-round budget was reached.";
  for (let round = 0; round < config.AGENT_MAX_MODEL_ROUNDS; round++) {
    await reportProgress({ type: "thinking", phase: "model" });
    const response = await llm.chat.completions.create({
      model: config.NVIDIA_NIM_MODEL,
      messages,
      tools: workflowAllowedTools
        ? agentTools.filter((tool) => tool.type === "function" && workflowAllowedTools.has(tool.function.name))
        : agentTools,
      tool_choice: "auto",
      temperature: 0.4
    }, { timeout: config.AGENT_MODEL_TIMEOUT_MS });
    const message = response.choices[0]?.message;
    if (!message) {
      stopReason = "The model returned an empty response.";
      break;
    }
    messages.push(message);

    const evaluation = evaluateTurn(message, round, config.AGENT_MAX_MODEL_ROUNDS);
    if (evaluation.kind === "complete") {
      endPhase(state, "execution");
      completeExecution(state, "completed");
      console.info("orchestra.execution", JSON.stringify({ ...summarizeExecution(state), route: route.reason }));
      await reportProgress({ type: "response_ready" });
      return finalResponse(evaluation.answer);
    }
    if (evaluation.kind === "limit_reached") {
      stopReason = "The direct tool-round budget was reached before the model completed its answer.";
      break;
    }
    if (evaluation.kind === "empty_turn") {
      stopReason = "The model returned an empty turn.";
      break;
    }

    const functionCalls = evaluation.calls.filter(isFunctionCall);
    const results = await executeToolCalls(
      functionCalls as ToolCallInput[],
      telegramId,
      reportProgress,
      workflowAllowedTools
    );
    const resultById = new Map(results.map((result) => [result.tool_call_id, result]));
    let hadToolErrors = false;
    for (const call of evaluation.calls) {
      if (call.type === "function") {
        const result = resultById.get(call.id);
        if (result) {
          messages.push(result);
          try { hadToolErrors ||= Boolean((JSON.parse(String(result.content)) as { error?: unknown }).error); } catch { /* non-JSON tool response */ }
        }
      } else {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "Unsupported tool call type." })
        });
      }
    }
    if (hadToolErrors) {
      await reportProgress({ type: "recovery_adjusting" });
      messages.push({
        role: "system",
        content: "One or more tool calls failed. Diagnose the returned error. Continue only if the missing information is necessary; if so, try a materially different safe approach. Do not repeat the same call unless the error is transient. Do not repeat mutations. If the existing evidence is already sufficient, finish with it and disclose any relevant limitation."
      });
    }
  }

  endPhase(state, "execution");
  beginPhase(state, "response");
  await reportProgress({ type: "verifying" });
  const answer = await synthesizeReport(messages, [], 0, stopReason);
  endPhase(state, "response");
  completeExecution(state, "completed");
  console.info("orchestra.execution", JSON.stringify({ ...summarizeExecution(state), route: route.reason }));
  await reportProgress({ type: "response_ready" });
  return answer;
}
