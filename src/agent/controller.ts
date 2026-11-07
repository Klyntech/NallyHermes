import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { config } from "../config.js";
import type { OrchestraEvent, ProgressEvent } from "./progress.js";
import { randomUUID } from "node:crypto";
import { createExecutionBudget, type ExecutionBudget } from "./executionBudget.js";
import { createEventPublisher } from "./eventStream.js";
import { agentTools } from "./definitions.js";
import { prepareRequest } from "./planner.js";
import { executeToolCalls, isReadOnlyCall, type ToolCallInput } from "./executor.js";
import { evaluateTurn, finalResponse, type ModelToolCall } from "./evaluator.js";
import { createExecutionPlan, type ExecutionPlan, type ExecutionPlanStep } from "./smartPlanner.js";
import { collectStepEvidence, getRecoverablePrerequisites, type StepEvidence } from "./executionState.js";
import { createModelCallTelemetry, type ModelCallTelemetry, type ModelCallTrace } from "./modelTelemetry.js";
import { buildStepContext, compactStepConversation, mergeStepEvidence, type StepExecutionOutcome } from "./stepContext.js";
import { ToolEvidenceCache } from "./toolEvidenceCache.js";

const llm = new OpenAI({
  apiKey: config.NVIDIA_NIM_API_KEY,
  baseURL: config.NVIDIA_NIM_BASE_URL
});

type StepOutcome = StepExecutionOutcome;

function isFunctionCall(call: ModelToolCall): call is Extract<ModelToolCall, { type: "function" }> {
  return call.type === "function";
}

function remainingTime(deadline: number): number {
  return Math.max(1_000, deadline - Date.now());
}


async function runPlannedStep(
  messages: ChatCompletionMessageParam[],
  step: ExecutionPlanStep,
  telegramId: string,
  maxToolRounds: number,
  readOnlyOnly: boolean,
  deadline: number,
  budget: ExecutionBudget,
  signal?: AbortSignal,
  onProgress?: (event: ProgressEvent) => Promise<void> | void,
  telemetry?: ModelCallTelemetry,
  evidenceCache: ToolEvidenceCache = new ToolEvidenceCache()
): Promise<StepOutcome> {
  const stepMessageStart = messages.length;
  // The caller supplies an isolated context: original request plus bounded
  // prerequisite results. Tool-call/response pairs stay local to this step.

  let toolRounds = 0;
  let duplicateOnlyRounds = 0;
  let accumulatedEvidence: StepEvidence = { observations: [], assistantNotes: [] };
  let failureReason = "The step stopped before the model produced a final result.";
  try {
    for (let round = 0; round <= maxToolRounds; round++) {
      if (round > 0) {
        accumulatedEvidence = compactStepConversation(messages, stepMessageStart, accumulatedEvidence);
      }
      if (signal?.aborted) {
        failureReason = "The request was cancelled.";
        break;
      }
      if (Date.now() >= deadline) {
        failureReason = "The overall planned-execution time budget was reached.";
        break;
      }
      if (!budget.reserveModelTurn()) {
        failureReason = "The request model-turn budget was exhausted.";
        break;
      }
      await onProgress?.({ type: "thinking", phase: "model" });
      const request = () => llm.chat.completions.create({
        model: config.NVIDIA_NIM_MODEL,
        messages,
        tools: agentTools,
        tool_choice: "auto",
        temperature: 0.4
      }, { timeout: remainingTime(deadline), signal });
      const response = telemetry
        ? await telemetry.run({
            phase: step.id.startsWith("recovery_") ? "recovery" : "step_execution",
            reason: (step.id.startsWith("recovery_") ? "recover_step:" : "execute_step:") + step.id,
            model: config.NVIDIA_NIM_MODEL,
            stepId: step.id,
            turnIndex: round,
            contextMode: "step_context_delta",
            messages
          }, request)
        : await request();
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
          answer: finalResponse(evaluation.answer),
          evidence: mergeStepEvidence(accumulatedEvidence, collectStepEvidence(messages.slice(stepMessageStart)))
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
      if (signal?.aborted) {
        failureReason = "The request was cancelled before tool execution.";
        break;
      }
      if (readOnlyOnly && !functionCalls.every((call) => isReadOnlyCall(call as ToolCallInput))) {
        failureReason = "The step requested a non-read-only tool operation, so it was not executed.";
        break;
      }

      toolRounds++;
      const execution = await evidenceCache.execute(
        functionCalls as ToolCallInput[],
        (uniqueCalls) => executeToolCalls(uniqueCalls, telegramId, onProgress, budget, signal)
      );
      const results = execution.results;
      if (execution.reusedCount > 0 && execution.executedCount === 0) {
        duplicateOnlyRounds++;
        await onProgress?.({ type: "recovery_adjusting" });
        messages.push({
          role: "system",
          content: "These read-only results were reused from earlier successful calls because the requested research substantially duplicates completed work. Use the returned evidence. Do not issue the same or a near-identical search again. If a genuinely different required fact is missing, state that exact gap before making a different call."
        });
        if (duplicateOnlyRounds >= 2) {
          failureReason = "Stopped after repeated duplicate read-only requests without new evidence.";
        }
      } else {
        duplicateOnlyRounds = 0;
      }
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
      if (duplicateOnlyRounds >= 2) break;
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

  const evidence = mergeStepEvidence(accumulatedEvidence, collectStepEvidence(messages.slice(stepMessageStart)));
  const hasEvidence = evidence.observations.length > 0;
  return {
    id: step.id,
    task: step.task,
    status: hasEvidence ? "partial" : "failed",
    toolRounds,
    answer: hasEvidence
      ? "Step did not reach a verified final answer. Available observations: " + JSON.stringify(evidence)
      : "No usable result was produced.",
    evidence,
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
  deadline?: number,
  budget?: ExecutionBudget,
  signal?: AbortSignal,
  telemetry?: ModelCallTelemetry
): Promise<string> {
  const reportData = {
    execution_status: outcomes.length === totalSteps && outcomes.every((item) => item.status === "completed")
      ? "complete"
      : "partial_or_incomplete",
    completed_steps: outcomes.filter((item) => item.status === "completed").length,
    partial_steps: outcomes.filter((item) => item.status === "partial").length,
    failed_steps: outcomes.filter((item) => item.status === "failed").length,
    blocked_steps: outcomes.filter((item) => item.status === "blocked").length,
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
  if (signal?.aborted) return fallbackReport(outcomes, totalSteps, reason + " (request cancelled)");
  if (budget && !budget.reserveModelTurn()) {
    return fallbackReport(outcomes, totalSteps, reason + " (final synthesis model-turn budget exhausted)");
  }
  try {
    const options = { timeout: deadline ? remainingTime(deadline) : config.AGENT_MODEL_TIMEOUT_MS, signal };
    const request = () => llm.chat.completions.create({
      model: config.NVIDIA_NIM_MODEL,
      messages: reportMessages,
      temperature: 0.4
    }, options);
    const final = telemetry
      ? await telemetry.run({
          phase: "synthesis",
          reason: "synthesize_step_outcomes_and_verify_report_requirements",
          model: config.NVIDIA_NIM_MODEL,
          contextMode: "evidence_package",
          messages: reportMessages
        }, request)
      : await request();
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
  budget: ExecutionBudget,
  signal?: AbortSignal,
  onProgress?: (event: ProgressEvent) => Promise<void> | void,
  telemetry?: ModelCallTelemetry
): Promise<string> {
  const evidenceCache = new ToolEvidenceCache();
  const completed = new Set<string>();
  const outcomes: StepOutcome[] = [];
  const pending = new Set(steps.map((step) => step.id));
  let totalToolRounds = 0;
  const deadline = Date.now() + config.AGENT_PLAN_TIMEOUT_MS;
  let stopReason = "All executable plan steps were processed.";
  let recoveryAttempts = 0;
  const recoveryAttempted = new Set<string>();

  while (pending.size) {
    if (signal?.aborted) {
      stopReason = "The request was cancelled.";
      break;
    }
    if (Date.now() >= deadline) {
      stopReason = "The overall planned-execution time limit was reached.";
      break;
    }
    const ready = steps.filter((step) =>
      pending.has(step.id) && step.depends_on.every((dependency) => completed.has(dependency))
    );
    if (!ready.length) {
      // A failed read-only prerequisite may be recoverable. Recover it before
      // declaring its dependents blocked, then recompute readiness on the next pass.
      const failedIds = new Set(outcomes
        .filter((item) => item.status !== "completed" && !recoveryAttempted.has(item.id))
        .map((item) => item.id));
      const recoverable = recoveryAttempts < 2
        ? getRecoverablePrerequisites(steps, pending, failedIds)
            .find((step) => step.parallel_safe)
        : undefined;
      if (!recoverable || Date.now() >= deadline) {
        stopReason = "Some steps could not run because one or more prerequisite steps did not complete.";
        break;
      }
      const previous = outcomes.find((item) => item.id === recoverable.id)!;
      recoveryAttempts++;
      recoveryAttempted.add(recoverable.id);
      await onProgress?.({ type: "recovery_adjusting" });
      await onProgress?.({
        type: "plan_step_start",
        index: steps.findIndex((item) => item.id === recoverable.id) + 1,
        total: steps.length,
        task: "Recovering prerequisite: " + recoverable.task
      });
      const recoveryStep: ExecutionPlanStep = {
        id: "recovery_" + recoverable.id,
        task: [
          "Recover the unresolved read-only task: " + recoverable.task,
          "Previous limitation: " + (previous.failureReason ?? "The task did not reach a verified result") + ".",
          "Use existing evidence first. Choose a materially different read-only approach only if a necessary gap remains.",
          "Do not repeat completed searches or fetches without a clear reason. Never perform mutations."
        ].join(" "),
        depends_on: [recoverable.id],
        parallel_safe: true,
        completion_criteria: recoverable.completion_criteria
      };
      const remainingRecoveryBudget = config.AGENT_MAX_PLAN_TOOL_ROUNDS - totalToolRounds;
      if (remainingRecoveryBudget <= 0) {
        stopReason = "The total planned tool-round budget was reached.";
        break;
      }
      const recovered = await runPlannedStep(
        buildStepContext(messages, recoveryStep, steps, outcomes),
        recoveryStep,
        telegramId,
        Math.max(1, Math.min(3, config.AGENT_MAX_STEP_TOOL_ROUNDS, remainingRecoveryBudget)),
        true,
        deadline,
        budget,
        signal,
        onProgress,
        telemetry,
        evidenceCache
      );
      totalToolRounds += recovered.toolRounds;
      if (recovered.status === "completed") {
        const outcomeIndex = outcomes.findIndex((item) => item.id === recoverable.id);
        outcomes[outcomeIndex] = {
          ...previous,
          status: "completed",
          toolRounds: previous.toolRounds + recovered.toolRounds,
          answer: recovered.answer,
          evidence: recovered.evidence,
          failureReason: undefined
        };
        completed.add(recoverable.id);
        await onProgress?.({
          type: "plan_step_complete",
          index: steps.findIndex((item) => item.id === recoverable.id) + 1,
          total: steps.length
        });
        continue;
      }
      const outcomeIndex = outcomes.findIndex((item) => item.id === recoverable.id);
      outcomes[outcomeIndex] = {
        ...previous,
        toolRounds: previous.toolRounds + recovered.toolRounds,
        answer: previous.answer + "\nRecovery attempt: " + recovered.answer,
        evidence: {
          observations: [...previous.evidence.observations, ...recovered.evidence.observations].slice(-8),
          assistantNotes: [...previous.evidence.assistantNotes, ...recovered.evidence.assistantNotes].slice(-4)
        },
        failureReason: recovered.failureReason ?? previous.failureReason
      };
      continue;
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
        buildStepContext(messages, step, steps, outcomes),
        step,
        telegramId,
        perStepBudget,
        step.parallel_safe,
        deadline,
        budget,
        signal,
        onProgress,
        telemetry,
        evidenceCache
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
        await onProgress?.({ type: "plan_step_complete", index, total: steps.length });
      } else if (outcome.status === "partial") {
        await onProgress?.({ type: "plan_step_partial", index, total: steps.length });
      } else {
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
        status: blocked ? "blocked" : "failed",
        toolRounds: 0,
        answer: "This step was not executed.",
        evidence: { observations: [], assistantNotes: [] },
        failureReason: blocked
          ? "A prerequisite step did not complete."
          : stopReason
      });
      await onProgress?.({
        type: blocked ? "plan_step_blocked" : "plan_step_failed",
        index: steps.findIndex((item) => item.id === step.id) + 1,
        total: steps.length
      });
    }
  }

  // One bounded replanning pass for remaining failed read-only steps.
  // Prerequisites recovered above have already reopened dependency scheduling.
  for (const step of steps) {
    if (signal?.aborted || recoveryAttempts >= 2 || Date.now() >= deadline) break;
    if (!step.parallel_safe || recoveryAttempted.has(step.id)) continue;
    const outcomeIndex = outcomes.findIndex((item) => item.id === step.id);
    const previous = outcomes[outcomeIndex];
    if (!previous || previous.status === "completed") continue;
    const remainingBudget = config.AGENT_MAX_PLAN_TOOL_ROUNDS - totalToolRounds;
    if (remainingBudget <= 0) break;

    recoveryAttempts++;
    recoveryAttempted.add(step.id);
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
      depends_on: [step.id],
      parallel_safe: true,
      completion_criteria: step.completion_criteria
    };
    const recoveryBudget = Math.max(1, Math.min(3, config.AGENT_MAX_STEP_TOOL_ROUNDS, remainingBudget));
    const recovered = await runPlannedStep(
      buildStepContext(messages, recoveryStep, steps, outcomes),
      recoveryStep,
      telegramId,
      recoveryBudget,
      true,
      deadline,
      budget,
      signal,
      onProgress,
      telemetry,
      evidenceCache
    );
    totalToolRounds += recovered.toolRounds;
    if (recovered.status === "completed") {
      outcomes[outcomeIndex] = {
        ...previous,
        status: "completed",
        toolRounds: previous.toolRounds + recovered.toolRounds,
        answer: recovered.answer,
        evidence: recovered.evidence,
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
        evidence: {
          observations: [...previous.evidence.observations, ...recovered.evidence.observations].slice(-8),
          assistantNotes: [...previous.evidence.assistantNotes, ...recovered.evidence.assistantNotes].slice(-4)
        },
        failureReason: recovered.failureReason ?? previous.failureReason
      };
      await onProgress?.({
        type: "plan_step_failed",
        index: steps.findIndex((item) => item.id === step.id) + 1,
        total: steps.length
      });
    }
  }

  const completedSteps = outcomes.filter((item) => item.status === "completed").length;
  const partialSteps = outcomes.filter((item) => item.status === "partial").length;
  const failedSteps = outcomes.filter((item) => item.status === "failed").length;
  const blockedSteps = outcomes.filter((item) => item.status === "blocked").length;
  const taskStatus = completedSteps === steps.length
    ? "complete"
    : completedSteps + partialSteps > 0 ? "partial" : "failed";
  await onProgress?.({
    type: "task_status",
    status: taskStatus,
    completedSteps,
    partialSteps,
    failedSteps,
    blockedSteps,
    totalSteps: steps.length
  });
  await onProgress?.({ type: "verifying" });
  return synthesizeReport(messages, outcomes, steps.length, stopReason, deadline, budget, signal, telemetry);
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
  onEvent?: (event: OrchestraEvent) => Promise<void> | void,
  signal?: AbortSignal,
  onTelemetry?: (trace: ModelCallTrace) => Promise<void> | void
): Promise<string> {
  const telemetry = createModelCallTelemetry(onTelemetry);
  const emitProgress = createEventPublisher({
    requestId: randomUUID(),
    onProgress,
    onEvent
  });
  const budget = createExecutionBudget({
    maxToolCalls: config.AGENT_MAX_TOOL_CALLS,
    maxModelTurns: config.AGENT_MAX_PLAN_MODEL_TURNS
  });
  const { messages } = await prepareRequest(history, userMessage, telegramId);
  if (signal?.aborted) {
    await emitProgress({ type: "request_cancelled" });
    return "Request cancelled before execution started.";
  }

  await emitProgress({ type: "planning" });
  let plan: ExecutionPlan | null = null;
  try {
    if (signal?.aborted) throw new Error("The request was cancelled before planning.");
    if (!budget.reserveModelTurn()) throw new Error("The request model-turn budget was exhausted before planning.");
    plan = await createExecutionPlan(llm, history, userMessage, telemetry);
  } catch (error) {
    console.warn("Smart planning unavailable; using direct execution:", error);
  }

  if (plan) {
    await emitProgress({ type: "plan_created", stepCount: plan.steps.length });
    const answer = await runPlannedRequest(messages, plan.steps, telegramId, budget, signal, emitProgress, telemetry);
    await emitProgress({ type: signal?.aborted ? "request_cancelled" : "response_ready" });
    return answer;
  }

  let stopReason = "The direct tool-round budget was reached.";
  for (let round = 0; round < config.AGENT_MAX_MODEL_ROUNDS; round++) {
    if (signal?.aborted) {
      stopReason = "The request was cancelled.";
      break;
    }
    if (!budget.reserveModelTurn()) {
      stopReason = "The request model-turn budget was exhausted.";
      break;
    }
    await emitProgress({ type: "thinking", phase: "model" });
    let response;
    try {
      const request = () => llm.chat.completions.create({
        model: config.NVIDIA_NIM_MODEL,
        messages,
        tools: agentTools,
        tool_choice: "auto",
        temperature: 0.4
      }, { timeout: config.AGENT_MODEL_TIMEOUT_MS, signal });
      response = await telemetry.run({
        phase: "direct_execution",
        reason: "direct_agent_turn:" + round,
        model: config.NVIDIA_NIM_MODEL,
        turnIndex: round,
        contextMode: "full_accumulated",
        messages
      }, request);
    } catch (error) {
      if (signal?.aborted) {
        stopReason = "The request was cancelled while waiting for the model.";
        break;
      }
      throw error;
    }
    const message = response.choices[0]?.message;
    if (!message) {
      stopReason = "The model returned an empty response.";
      break;
    }
    messages.push(message);

    const evaluation = evaluateTurn(message, round, config.AGENT_MAX_MODEL_ROUNDS);
    if (evaluation.kind === "complete") {
      await emitProgress({
        type: "task_status",
        status: "complete",
        completedSteps: 1,
        partialSteps: 0,
        failedSteps: 0,
        blockedSteps: 0,
        totalSteps: 1
      });
      await emitProgress({ type: "response_ready" });
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
    if (signal?.aborted) {
      stopReason = "The request was cancelled before tool execution.";
      break;
    }
    const results = await executeToolCalls(
      functionCalls as ToolCallInput[],
      telegramId,
      emitProgress,
      budget,
      signal
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
      await emitProgress({ type: "recovery_adjusting" });
      messages.push({
        role: "system",
        content: "One or more tool calls failed. Diagnose the returned error. Continue only if the missing information is necessary; if so, try a materially different safe approach. Do not repeat the same call unless the error is transient. Do not repeat mutations. If the existing evidence is already sufficient, finish with it and disclose any relevant limitation."
      });
    }
  }

  const hasToolEvidence = messages.some((item) => item.role === "tool");
  await emitProgress({
    type: "task_status",
    status: hasToolEvidence ? "partial" : "failed",
    completedSteps: 0,
    partialSteps: hasToolEvidence ? 1 : 0,
    failedSteps: hasToolEvidence ? 0 : 1,
    blockedSteps: 0,
    totalSteps: 1
  });
  await emitProgress({ type: "verifying" });
  const answer = await synthesizeReport(messages, [], 0, stopReason, undefined, budget, signal, telemetry);
  await emitProgress({ type: signal?.aborted ? "request_cancelled" : "response_ready" });
  return answer;
}
