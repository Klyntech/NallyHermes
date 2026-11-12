import type { ChatCompletionMessageParam } from "openai/resources/index.js";

export function buildFollowUpContext(history: ChatCompletionMessageParam[], userMessage: string): string | null {
  const text = userMessage.trim();
  if (!text || text.length > 160 || history.length === 0) return null;

  const recent = history.slice(-6).map((message) => {
    const content = typeof message.content === "string" ? message.content : "[non-text message]";
    return `${message.role}: ${content.slice(0, 1_500)}`;
  }).join("\n");

  return [
    "FOLLOW-UP CONTEXT RULE:",
    "The user's latest message may be a continuation and must be interpreted against the active topic in the recent conversation, not automatically as an unrelated standalone request.",
    "Resolve references such as confirmations, corrections, pronouns, omitted subjects, and requested updates against the most recent unresolved question, event, or proposed action.",
    "If the conversation concerns a match or event, determine whether the user means the event time or the current clock time from the full context; do not guess.",
    "If the active topic has more than one plausible interpretation, ask one focused clarification question instead of silently switching topics.",
    "Do not create or confirm a schedule until the referenced event, exact time or condition, timezone, and recurrence are clear.",
    "Recent conversation:",
    recent
  ].join("\n");
}
