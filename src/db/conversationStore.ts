import { and, asc, desc, eq, gt } from "drizzle-orm";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { db } from "./client.js";
import { conversations, messages, users } from "./schema.js";

const MAX_PERSISTED_MESSAGES = 40;

async function getUserId(telegramId: string): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (!user) throw new Error("User profile is not ready yet.");
  return user.id;
}

export async function getOrCreateConversation(telegramId: string, chatId: string): Promise<string> {
  const userId = await getUserId(telegramId);
  const [existing] = await db.select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.telegramChatId, chatId)))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db.insert(conversations)
    .values({ userId, telegramChatId: chatId })
    .returning({ id: conversations.id });
  if (!created) throw new Error("Conversation could not be created.");
  return created.id;
}

export async function loadConversationHistory(conversationId: string): Promise<ChatCompletionMessageParam[]> {
  const rows = await db.select({ role: messages.role, content: messages.content, status: messages.status })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.sequence));

  return rows.filter((message) => message.status === "complete").slice(-MAX_PERSISTED_MESSAGES).map((message) => ({
    role: message.role as "user" | "assistant",
    content: message.content
  }));
}

export async function appendConversationExchange(
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
  sourceChannel: "telegram" | "android" = "telegram",
  sourceMessageId?: string
): Promise<void> {
  const values = [
    { conversationId, role: "user", content: userMessage, sourceChannel, sourceMessageId: sourceMessageId ?? null, status: "complete" },
    { conversationId, role: "assistant", content: assistantMessage, sourceChannel: "agent", sourceMessageId: null, status: "complete" }
  ];
  await db.insert(messages).values(values);
  await db.update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function hasConversationMessageSource(
  conversationId: string,
  sourceChannel: "telegram" | "android",
  sourceMessageId: string
): Promise<boolean> {
  const [existing] = await db.select({ id: messages.id })
    .from(messages)
    .where(and(
      eq(messages.conversationId, conversationId),
      eq(messages.sourceChannel, sourceChannel),
      eq(messages.sourceMessageId, sourceMessageId)
    ))
    .limit(1);
  return Boolean(existing);
}

export async function findConversationMessageSource(
  conversationId: string,
  sourceChannel: "telegram" | "android",
  sourceMessageId: string
): Promise<{ id: string; status: string } | null> {
  const [existing] = await db.select({ id: messages.id, status: messages.status })
    .from(messages)
    .where(and(
      eq(messages.conversationId, conversationId),
      eq(messages.sourceChannel, sourceChannel),
      eq(messages.sourceMessageId, sourceMessageId)
    ))
    .limit(1);
  return existing ?? null;
}

export async function appendConversationMessage(input: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  sourceChannel: "telegram" | "android" | "agent";
  sourceMessageId?: string;
  status?: "pending" | "awaiting_approval" | "complete" | "failed";
}): Promise<{ id: string; sequence: number }> {
  const [created] = await db.insert(messages).values({
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    sourceChannel: input.sourceChannel,
    sourceMessageId: input.sourceMessageId ?? null,
    status: input.status ?? "complete"
  }).returning({ id: messages.id, sequence: messages.sequence });
  if (!created) throw new Error("Conversation message could not be stored.");
  await db.update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, input.conversationId));
  return created;
}

export async function setConversationMessageStatus(
  messageId: string,
  status: "pending" | "awaiting_approval" | "complete" | "failed"
): Promise<void> {
  await db.update(messages).set({ status }).where(eq(messages.id, messageId));
}

export async function completeLatestAwaitingMessage(
  conversationId: string,
  assistantMessage: string
): Promise<boolean> {
  const [pending] = await db.select({ id: messages.id })
    .from(messages)
    .where(and(
      eq(messages.conversationId, conversationId),
      eq(messages.role, "user"),
      eq(messages.status, "awaiting_approval")
    ))
    .orderBy(desc(messages.sequence))
    .limit(1);
  if (!pending) return false;
  await appendConversationMessage({
    conversationId,
    role: "assistant",
    content: assistantMessage,
    sourceChannel: "agent"
  });
  await setConversationMessageStatus(pending.id, "complete");
  return true;
}

export async function loadConversationMessages(
  conversationId: string,
  afterSequence = 0,
  limit = 100
): Promise<Array<{
  id: string;
  sequence: number;
  role: string;
  content: string;
  sourceChannel: string;
  status: string;
  createdAt: Date;
}>> {
  const columns = {
    id: messages.id,
    sequence: messages.sequence,
    role: messages.role,
    content: messages.content,
    sourceChannel: messages.sourceChannel,
    status: messages.status,
    createdAt: messages.createdAt
  };
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
  if (afterSequence <= 0) {
    const recent = await db.select(columns)
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.sequence))
      .limit(boundedLimit);
    return recent.reverse();
  }
  return db.select(columns)
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), gt(messages.sequence, afterSequence)))
    .orderBy(asc(messages.sequence))
    .limit(boundedLimit);
}
