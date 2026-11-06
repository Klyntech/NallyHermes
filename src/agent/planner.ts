import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { SYSTEM_PROMPT } from "./definitions.js";
import { buildClockContext } from "./clock.js";

export interface RequestContext {
  messages: ChatCompletionMessageParam[];
}

/**
 * Phase 1 request preparation.
 * The model remains responsible for choosing tools; this stage supplies trusted
 * policy and trusted clock context; the model decides whether to call memory.
 */
export async function prepareRequest(
  history: ChatCompletionMessageParam[],
  userMessage: string,
  telegramId: string
): Promise<RequestContext> {
  const clockContext = await buildClockContext(telegramId);
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: clockContext },
    ...history,
    { role: "user", content: userMessage }
  ];

  return { messages };
}
