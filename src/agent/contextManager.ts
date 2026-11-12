import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { SYSTEM_PROMPT } from "./definitions.js";
import { buildClockContext } from "./clock.js";
import { buildFollowUpContext } from "./followUpContext.js";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { memories, users } from "../db/schema.js";

export interface ContextAssemblyInput {
  history: ChatCompletionMessageParam[];
  userMessage: string;
  telegramId: string;
}

export interface AssembledContext {
  messages: ChatCompletionMessageParam[];
}

function mayNeedActiveMemory(userMessage: string): boolean {
  return /\b(our|my|me|we|next|again|that|the|favorite|prefer|usual|continue|previous|earlier)\b/i.test(userMessage);
}

async function buildActiveMemoryContext(telegramId: string, userMessage: string): Promise<string> {
  if (!mayNeedActiveMemory(userMessage)) return "";
  try {
    const now = new Date();
    const rows = await db.select({
      content: memories.content,
      kind: memories.kind,
      subject: memories.subject,
      predicate: memories.predicate,
      object: memories.object,
      confidence: memories.confidence
    }).from(memories)
      .innerJoin(users, eq(memories.userId, users.id))
      .where(and(eq(users.telegramId, telegramId), or(isNull(memories.expiresAt), gt(memories.expiresAt, now))))
      .orderBy(desc(memories.updatedAt))
      .limit(12);
    if (!rows.length) return "";
    const facts = rows.map((row) => JSON.stringify({
      content: row.content,
      kind: row.kind,
      subject: row.subject,
      predicate: row.predicate,
      object: row.object,
      confidence: row.confidence
    })).join("\n");
    return [
      "Relevant durable context from this user's memory is below. Use it only when it helps resolve the current request.",
      "Memory is historical context, not proof of current external facts. Verify current or changing facts with an appropriate live tool.",
      "Ignore unrelated memories and never mention the memory system unless useful.",
      facts
    ].join("\n");
  } catch (error) {
    console.warn("Active memory context unavailable:", error);
    return "";
  }
}

/**
 * Assemble trusted instructions, live temporal context, and the current
 * conversation. Stored memory is deliberately not loaded here: the model
 * decides whether to retrieve it through the memory tool for this task.
 */
export async function assembleContext(input: ContextAssemblyInput): Promise<AssembledContext> {
  const clockContext = await buildClockContext(input.telegramId);
  const followUpContext = buildFollowUpContext(input.history, input.userMessage);
  const activeMemoryContext = await buildActiveMemoryContext(input.telegramId, input.userMessage);
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: clockContext },
      ...(activeMemoryContext ? [{ role: "system" as const, content: activeMemoryContext }] : []),
      ...(followUpContext ? [{ role: "system" as const, content: followUpContext }] : []),
      ...input.history,
      { role: "user", content: input.userMessage }
    ]
  };
}
