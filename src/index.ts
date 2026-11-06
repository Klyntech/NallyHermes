import { Bot } from "grammy";
import { eq } from "drizzle-orm";
import { config } from "./config.js";
import { db } from "./db/client.js";
import { users } from "./db/schema.js";
import { respond } from "./agent/orchestrator.js";
import { deliverDueJobs } from "./agent/tools/index.js";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
const histories = new Map<number, ChatCompletionMessageParam[]>();

bot.command("start", async (ctx) => {
  await ctx.reply("Hello! I'm NallyHermes. I can research, fetch webpages, manage workspace files, remember useful details and schedule reminders. What can I help you with?");
});

bot.on("message:text", async (ctx) => {
  await ctx.replyWithChatAction("typing");
  try {
    const telegramId = String(ctx.from.id);
    const [user] = await db.insert(users).values({
      telegramId,
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name ?? null
    }).onConflictDoUpdate({
      target: users.telegramId,
      set: { username: ctx.from.username ?? null, firstName: ctx.from.first_name ?? null }
    }).returning({ id: users.id });
    const history = histories.get(ctx.chat.id) ?? [];
    const answer = await respond(history, ctx.message.text, { userId: user.id, telegramChatId: ctx.chat.id });
    history.push({ role: "user", content: ctx.message.text }, { role: "assistant", content: answer });
    histories.set(ctx.chat.id, history.slice(-20));
    await ctx.reply(answer);
  } catch (error) {
    console.error("Agent request failed:", error);
    await ctx.reply("I ran into a problem processing that. Please try again shortly.");
  }
});

bot.catch((error) => console.error("Telegram bot error:", error));
console.info("Starting NallyHermes...");
setInterval(() => {
  void deliverDueJobs((chatId, message) => bot.api.sendMessage(chatId, message))
    .catch((error) => console.error("Scheduler polling failed:", error));
}, 15_000);
await bot.start();
