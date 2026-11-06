import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { config } from "../config.js";
import type { ProgressEvent } from "./progress.js";
import { agentTools } from "./definitions.js";
import { prepareRequest } from "./planner.js";
import { executeToolCall } from "./executor.js";
import { evaluateTurn, finalResponse } from "./evaluator.js";

const llm = new OpenAI({
  apiKey: config.NVIDIA_NIM_API_KEY,
  baseURL: config.NVIDIA_NIM_BASE_URL
});

const MAX_MODEL_ROUNDS = 6;

/**
 * Orchestra controller: owns the request lifecycle and delegates preparation,
 * tool execution, and completion decisions to focused modules.
 */
export async function runAgent(
  history: ChatCompletionMessageParam[],
  userMessage: string,
  telegramId: string,
  onProgress?: (event: ProgressEvent) => Promise<void> | void
): Promise<string> {
  const { messages } = await prepareRequest(history, userMessage, telegramId);

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
    if (evaluation.kind === "limit_reached") break;
    if (evaluation.kind === "empty_turn") break;

    for (const call of evaluation.calls) {
      if (call.type !== "function") {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "Unsupported tool call type." })
        });
        continue;
      }
      messages.push(await executeToolCall(call, telegramId, onProgress));
    }
  }

  await onProgress?.({ type: "response_ready" });
  return "I couldn't complete that request within the tool-call limit. Please try again.";
}
