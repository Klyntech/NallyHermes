import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { SYSTEM_PROMPT } from "./definitions.js";
import { buildClockContext } from "./clock.js";

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
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: clockContext },
      ...input.history,
      { role: "user", content: input.userMessage }
    ]
  };
}
