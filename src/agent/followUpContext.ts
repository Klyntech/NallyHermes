import type { ChatCompletionMessageParam } from "openai/resources/index.js";

const SHORT_FOLLOW_UP = /^(confirm|confirm time|what time|which time|yes|yeah|yep|do that|update me|cancel it|cancel that|change it|when|and the score|the score)$/i;

export function buildFollowUpContext(history: ChatCompletionMessageParam[], userMessage: string): string | null {
  const text = userMessage.trim();
  if (!text || text.length > 80 || !SHORT_FOLLOW_UP.test(text)) return null;

  const recent = history.slice(-6).map((message) => {
    const content = typeof message.content === "string" ? message.content : "[non-text message]";
    return `${message.role}: ${content.slice(0, 1_500)}`;
  }).join("\n");

  return [
    "FOLLOW-UP CONTEXT RULE:",
    "The user's latest message is short and must be interpreted against the active topic in the recent conversation, not as an unrelated standalone request.",
    "Resolve words such as confirm, time, yes, update me, cancel it, and the score against the most recent unresolved question, event, or proposed action.",
    "In a match or event discussion, 'confirm time' means confirm the event time; do not report the current clock time unless the user explicitly asks what time it is now.",
    "If the active topic has more than one plausible interpretation, ask one focused clarification question instead of silently switching topics.",
    "Do not create or confirm a schedule until the referenced event, exact time or condition, timezone, and recurrence are clear.",
    "Recent conversation:",
    recent
  ].join("\n");
}
