import type { ChatCompletionMessageParam } from "openai/resources/index.js";

function extractCandidateEntities(text: string): string[] {
  const out: string[] = [];
  // Capitalized multi-word names / titles (bounded, not NER)
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g)) {
    const s = m[1]!.trim();
    if (s.length < 3 || s.length > 48) continue;
    if (/^(The|This|That|There|When|What|Why|How|Please|Thanks|Hello|Hi)\b/.test(s)) continue;
    out.push(s);
  }
  // Quoted phrases
  for (const m of text.matchAll(/"([^"]{2,40})"/g)) out.push(m[1]!.trim());
  return [...new Set(out)].slice(0, 8);
}

export function buildFollowUpContext(history: ChatCompletionMessageParam[], userMessage: string): string | null {
  const text = userMessage.trim();
  if (!text || text.length > 160 || history.length === 0) return null;

  const recentMessages = history.slice(-6);
  const recent = recentMessages
    .map((message) => {
      const content = typeof message.content === "string" ? message.content : "[non-text message]";
      return `${message.role}: ${content.slice(0, 1_500)}`;
    })
    .join("\n");

  const entityPool = recentMessages
    .flatMap((message) =>
      typeof message.content === "string" ? extractCandidateEntities(message.content) : []
    )
    .slice(0, 10);

  const lines = [
    "FOLLOW-UP CONTEXT RULE:",
    "The user's latest message may be a continuation and must be interpreted against the active topic in the recent conversation, not automatically as an unrelated standalone request.",
    "Resolve references such as confirmations, corrections, pronouns, omitted subjects, and requested updates against the most recent unresolved question, event, or proposed action.",
    "If the conversation concerns a match or event, determine whether the user means the event time or the current clock time from the full context; do not guess.",
    "If the active topic has more than one plausible interpretation, ask one focused clarification question instead of silently switching topics.",
    "Do not create or confirm a schedule until the referenced event, exact time or condition, timezone, and recurrence are clear."
  ];
  if (entityPool.length) {
    lines.push(
      "Candidate entities from recent turns (bind incomplete references like \"our next match\" only when unambiguous): " +
        entityPool.join("; ")
    );
  }
  lines.push("Recent conversation:", recent);
  return lines.join("\n");
}
