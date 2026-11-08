import { and, asc, desc, eq } from "drizzle-orm";
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
  const rows = await db.select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id));

  return rows.slice(-MAX_PERSISTED_MESSAGES).map((message) => ({
    role: message.role as "user" | "assistant",
    content: message.content
  }));
}

export async function appendConversationExchange(
  conversationId: string,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  const values = [
    { conversationId, role: "user", content: userMessage },
    { conversationId, role: "assistant", content: assistantMessage }
  ];
  await db.insert(messages).values(values);
  await db.update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}
