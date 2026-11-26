import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { db } from "../db/client.js";
import { memories, users } from "../db/schema.js";

export type ExtractedMemory = {
  content: string;
  kind: "preference" | "fact" | "commitment" | "entity";
  subject?: string;
  confidence: number;
};

/**
 * Conservative extraction of durable user assertions from the user message only.
 * Never treats assistant claims as memory. Application-controlled — not model authority.
 */
export function extractDurableUserAssertions(userMessage: string): ExtractedMemory[] {
  const text = userMessage.trim();
  if (!text || text.length < 8 || text.length > 800) return [];
  // Skip pure questions
  if (/^\s*[\w\s,',-]{0,80}\?\s*$/.test(text) && !/\b(remember|prefer|always|my name)\b/i.test(text)) {
    return [];
  }

  const out: ExtractedMemory[] = [];
  const push = (item: ExtractedMemory) => {
    const content = item.content.trim().slice(0, 500);
    if (content.length < 4) return;
    if (out.some((x) => x.content.toLowerCase() === content.toLowerCase())) return;
    out.push({ ...item, content });
  };

  // Explicit remember
  const remember = text.match(/\bremember(?:\s+that)?\s+(.+?)(?:[.!]|$)/i);
  if (remember?.[1]) {
    push({ content: remember[1].trim(), kind: "fact", confidence: 85 });
  }

  // Name
  const name =
    text.match(/\b(?:my name is|i(?:'| a)?m called|call me)\s+([A-Za-z][A-Za-z\s\-']{1,40})/i) ||
    text.match(/\bi(?:'| a)?m\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (name?.[1] && !/^(going|trying|looking|here|just|not|the)\b/i.test(name[1])) {
    push({
      content: `User's name is ${name[1].trim()}`,
      kind: "entity",
      subject: name[1].trim().slice(0, 80),
      confidence: 80
    });
  }

  // Preferences
  const prefer = text.match(/\bi (?:prefer|always|never)\s+(.+?)(?:[.!]|$)/i);
  if (prefer?.[1]) {
    push({ content: `User preference: ${prefer[1].trim()}`, kind: "preference", confidence: 75 });
  }

  // Timezone / location (light)
  const tz = text.match(/\b(?:i(?:'| a)?m in|my timezone is|i live in)\s+([A-Za-z0-9_+\-\/ ]{2,60})/i);
  if (tz?.[1]) {
    push({
      content: `User location/timezone context: ${tz[1].trim()}`,
      kind: "fact",
      subject: "location",
      confidence: 70
    });
  }

  return out.slice(0, 3);
}

function historyUsedMemoryTool(messages: ChatCompletionMessageParam[]): boolean {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const toolCalls = (message as { tool_calls?: Array<{ function?: { name?: string } }> }).tool_calls;
    if (!toolCalls) continue;
    for (const call of toolCalls) {
      if (call.function?.name === "memory") return true;
    }
  }
  return false;
}

async function getUserId(telegramId: string): Promise<string | null> {
  try {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * After a successful turn, persist high-confidence user assertions if the memory tool was not used.
 * Fail-open: never blocks the response. Dedupes against recent memories for the same user.
 */
export async function persistTurnMemories(input: {
  telegramId: string;
  userMessage: string;
  messages: ChatCompletionMessageParam[];
  completed: boolean;
}): Promise<{ written: number }> {
  if (!input.completed) return { written: 0 };
  if (historyUsedMemoryTool(input.messages)) return { written: 0 };

  const candidates = extractDurableUserAssertions(input.userMessage);
  if (!candidates.length) return { written: 0 };

  const userId = await getUserId(input.telegramId);
  if (!userId) return { written: 0 };

  let written = 0;
  try {
    const recent = await db
      .select({ content: memories.content, subject: memories.subject })
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          or(isNull(memories.expiresAt), gt(memories.expiresAt, new Date()))
        )
      )
      .orderBy(desc(memories.updatedAt))
      .limit(30);

    const recentLower = recent.map((r) => (r.content || "").toLowerCase());

    for (const item of candidates) {
      const key = item.content.toLowerCase();
      if (recentLower.some((r) => r.includes(key) || key.includes(r.slice(0, 40)))) continue;

      await db.insert(memories).values({
        userId,
        content: item.content,
        kind: item.kind,
        subject: item.subject?.slice(0, 200) ?? null,
        predicate: null,
        object: null,
        confidence: item.confidence,
        source: "turn_extract",
        expiresAt: null,
        lastConfirmedAt: new Date(),
        metadata: { origin: "post_turn_extract" }
      });
      written++;
    }
  } catch (error) {
    console.warn("turn memory persist failed:", error);
    return { written: 0 };
  }

  if (written) {
    console.info("memory.turn_extract", JSON.stringify({ telegramId: input.telegramId, written }));
  }
  return { written };
}
