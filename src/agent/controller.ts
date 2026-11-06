import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { config } from "../config.js";
import type { ProgressEvent } from "./progress.js";
import { agentTools } from "./definitions.js";
import { prepareRequest } from "./planner.js";
import { executeToolCall, executeToolCalls, type ToolCallInput } from "./executor.js";
import { evaluateTurn, finalResponse, type ModelToolCall } from "./evaluator.js";
import { createExecutionPlan, type ExecutionPlanStep } from "./smartPlanner.js";

const llm = new OpenAI({
  apiKey: config.NVIDIA_NIM_API_KEY,
  baseURL: config.NVIDIA_NIM_BASE_URL
});

const MAX_MODEL_ROUNDS = 6;
const MAX_PLAN_TOOL_ROUNDS = 12;
const MAX_STEP_ROUNDS = 4;

function isFunctionCall(call: ModelToolCall): call is Extract<ModelToolCall, { type: "function" }> {
  return call.type === "function";
}

async function runPlannedStep(
  messages: ChatCompletionMessageParam[],
  step: ExecutionPlanStep,
  telegramId: string,
  onProgress?: (event: ProgressEvent) => Promise<void> | void
): Promise<{ answer: string; toolRounds: number } | null> {
  messages.push({
    role: "system",
    content: [
      `Execute this plan step now: ${step.task}`,
      "Use the available tools when needed. Do not attempt later steps.",
      "When this step is complete, give a concise factual result for this step only.",
      "If blocked, explain what is missing instead of claiming success."
    ].join("\n")
  });

  let toolRounds = 0;
  for (let round = 0; round < MAX_STEP_ROUNDS; round++) {
    await onProgress?.({ type: "thinking", phase: "model" });
    const response = await llm.chat.completions.create({
      model: config.NVIDIA_NIM_MODEL,
      messages,
      tools: agentTools,
      tool_choice: "auto",
      temperature: 0.4
    });
    const message = response.choices[0]?.message;
    if (!message) return null;
    messages.push(message);

    const evaluation = evaluateTurn(message, round, MAX_STEP_ROUNDS);
    if (evaluation.kind === "complete") {
      return { answer: finalResponse(evaluation.answer), toolRounds };
    }
    if (evaluation.kind !== "execute_tools") return null;

    toolRounds++;
    const functionCalls = evaluation.calls.filter(isFunctionCall);
    const results = await executeToolCalls(
      functionCalls as ToolCallInput[],
      telegramId,
      onProgress
    );
    const resultById = new Map(results.map((result) => [result.tool_call_id, result]));
    for (const call of evaluation.calls) {
      if (call.type === "function") {
        const result = resultById.get(call.id);
        if (result) messages.push(result);
      } else {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "Unsupported tool call type." })
        });
      }
    }
  }
  return null;
}

async function runPlannedRequest(
  messages: ChatCompletionMessageParam[],
  steps: ExecutionPlanStep[],
  telegramId: string,
  onProgress?: (event: ProgressEvent) => Promise<void> | void
): Promise<string> {
  const completed = new Set<string>();
  const results: Array<{ id: string; task: string; answer: string }> = [];
  let totalToolRounds = 0;

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]!;
    const stepNumber = index + 1;
    if (!step.depends_on.every((dependency) => completed.has(dependency))) {
      await onProgress?.({ type: "plan_step_failed", index: stepNumber, total: steps.length });
      continue;
    }
    if (totalToolRounds >= MAX_PLAN_TOOL_ROUNDS) {
      await onProgress?.({ type: "plan_step_failed", index: stepNumber, total: steps.length });
      continue;
    }

    await onProgress?.({
      type: "plan_step_start",
      index: stepNumber,
      total: steps.length,
      task: step.task
    });
    const outcome = await runPlannedStep(messages, step, telegramId, onProgress);
    if (!outcome) {
      await onProgress?.({ type: "plan_step_failed", index: stepNumber, total: steps.length });
      continue;
    }

    totalToolRounds += outcome.toolRounds;
    completed.add(step.id);
    results.push({ id: step.id, task: step.task, answer: outcome.answer });
    await onProgress?.({ type: "plan_step_complete", index: stepNumber, total: steps.length });
  }

  if (!results.length) {
    return "I couldn't complete the planned steps. Please clarify the request or try again.";
  }

  messages.push({
    role: "system",
    content: [
      "All executable plan steps have finished. Produce the final response to the user's original request.",
      "Synthesize the verified step results below. Clearly identify incomplete work; do not claim skipped or failed steps succeeded.",
      JSON.stringify({ completed_steps: results, total_steps: steps.length })
    ].join("\n\n")
  });
  const final = await llm.chat.completions.create({
    model: config.NVIDIA_NIM_MODEL,
    messages,
    temperature: 0.4
  });
  return finalResponse(final.choices[0]?.message?.content ?? results.map((item) => item.answer).join("\n\n"));
}

/**
 * Orchestra controller: uses model-led decomposition for complex work and
 * deterministic validation, dependency tracking, execution limits, and tool dispatch.
 */
export async function runAgent(
  history: ChatCompletionMessageParam[],
  userMessage: string,
  telegramId: string,
  onProgress?: (event: ProgressEvent) => Promise<void> | void
): Promise<string> {
  const { messages } = await prepareRequest(history, userMessage, telegramId);

  await onProgress?.({ type: "planning" });
  let plan = null;
  try {
    plan = await createExecutionPlan(llm, history, userMessage);
  } catch (error) {
    console.warn("Smart planning unavailable; using direct execution:", error);
  }

  if (plan) {
    await onProgress?.({ type: "plan_created", stepCount: plan.steps.length });
    const answer = await runPlannedRequest(messages, plan.steps, telegramId, onProgress);
    await onProgress?.({ type: "response_ready" });
    return answer;
  }

  for (let round = 0; round < MAX_MODEL_ROUNDS; round++) {
    await onProgress?.({ type: "thinking", phase: "model" });
    const response = await llm.chat.completions.create({
      model: config.NVIDIA_NIM_MODEL,
      messages,
      tools: agentTools,
      tool_choice: "auto",
      temperature: 0.4
    });

    const message = response.choices[0]?.message;
    if (!message) break;
    messages.push(message);

    const evaluation = evaluateTurn(message, round, MAX_MODEL_ROUNDS);
    if (evaluation.kind === "complete") {
      await onProgress?.({ type: "response_ready" });
      return finalResponse(evaluation.answer);
    }
    if (evaluation.kind === "limit_reached" || evaluation.kind === "empty_turn") break;

    const functionCalls = evaluation.calls.filter(isFunctionCall);
    const results = await executeToolCalls(
      functionCalls as ToolCallInput[],
      telegramId,
      onProgress
    );
    const resultById = new Map(results.map((result) => [result.tool_call_id, result]));
    for (const call of evaluation.calls) {
      if (call.type === "function") {
        const result = resultById.get(call.id);
        if (result) messages.push(result);
      } else {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "Unsupported tool call type." })
        });
      }
    }
  }

  await onProgress?.({ type: "response_ready" });
  return "I couldn't complete that request within the tool-call limit. Please try again.";
}
