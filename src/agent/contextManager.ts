import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { SYSTEM_PROMPT } from "./definitions.js";
import { buildClockContext } from "./clock.js";
import { buildFollowUpContext } from "./followUpContext.js";

export interface ContextAssemblyInput {
  history: ChatCompletionMessageParam[];
  userMessage: string;
  telegramId: string;
}

export interface AssembledContext {
  messages: ChatCompletionMessageParam[];
}

/**
 * Assemble trusted instructions, live temporal context, and the current
 * conversation. Stored memory is deliberately not loaded here: the model
 * decides whether to retrieve it through the memory tool for this task.
 */
export async function assembleContext(input: ContextAssemblyInput): Promise<AssembledContext> {
  const clockContext = await buildClockContext(input.telegramId);
  const followUpContext = buildFollowUpContext(input.history, input.userMessage);
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: clockContext },
      ...(followUpContext ? [{ role: "system" as const, content: followUpContext }] : []),
      ...input.history,
      { role: "user", content: input.userMessage }
    ]
  };
}
