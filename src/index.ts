import { createServer } from "node:http";
import { Bot, webhookCallback } from "grammy";
import { config } from "./config.js";
import { db, ensureDatabase } from "./db/client.js";
import { users } from "./db/schema.js";
import { respond } from "./agent/orchestrator.js";
import { startScheduleWorker } from "./agent/tools/extended.js";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
const histories = new Map<number, ChatCompletionMessageParam[]>();
const webhookPath = `/telegram/${config.WEBHOOK_SECRET}`;
const handleUpdate = webhookCallback(bot, "http", {
  secretToken: config.WEBHOOK_SECRET
});

bot.command("start", async (ctx) => {
  await ctx.reply("Hello! I'm NallyHermes. I can search and fetch web pages, manage your files and memories, and set reminders. What can I do for you?");
});

bot.on("message:text", async (ctx) => {
  if (!ctx.from) return;
  await ctx.replyWithChatAction("typing");
  try {
    const telegramId = String(ctx.from.id);
    await db.insert(users).values({
      telegramId,
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name ?? null
    }).onConflictDoUpdate({
      target: users.telegramId,
      set: { username: ctx.from.username ?? null, firstName: ctx.from.first_name ?? null }
    });
    const history = histories.get(ctx.chat.id) ?? [];
    const answer = await respond(history, ctx.message.text, telegramId);
    history.push({ role: "user", content: ctx.message.text }, { role: "assistant", content: answer });
    histories.set(ctx.chat.id, history.slice(-20));
    await ctx.reply(answer);
  } catch (error) {
    console.error("Agent request failed:", error);
    await ctx.reply("I ran into a problem processing that. Please try again shortly.");
  }
});

bot.catch((error) => console.error("Telegram bot error:", error));

console.info("Starting NallyHermes webhook server...");
await ensureDatabase();

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("OK");
    return;
  }

  if (req.method !== "POST" || req.url !== webhookPath) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  void handleUpdate(req, res);
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(config.PORT, "0.0.0.0", resolve);
});

const webhookUrl = `${config.WEBHOOK_URL.replace(/\/$/, "")}${webhookPath}`;
await bot.api.setWebhook(webhookUrl, {
  secret_token: config.WEBHOOK_SECRET,
  allowed_updates: ["message"]
});

console.info(`Telegram webhook listening on port ${config.PORT}`);
startScheduleWorker(async (telegramId, message) => {
  await bot.api.sendMessage(Number(telegramId), message);
});
