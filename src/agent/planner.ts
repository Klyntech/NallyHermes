import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { assembleContext } from "./contextManager.js";

export interface RequestContext {
  messages: ChatCompletionMessageParam[];
}

/**
 * Prepare the request context without automatically retrieving stored memory.
 * The model decides whether memory recall is useful for the current task.
 */
export async function prepareRequest(
  history: ChatCompletionMessageParam[],
  userMessage: string,
  telegramId: string
): Promise<RequestContext> {
  return assembleContext({ history, userMessage, telegramId });
}
