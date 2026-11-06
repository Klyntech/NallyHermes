import { createServer } from "node:http";
import { Bot, webhookCallback } from "grammy";
import { config } from "./config.js";
import { db, ensureDatabase } from "./db/client.js";
import { users } from "./db/schema.js";
import { respond } from "./agent/orchestrator.js";
import { startScheduleWorker } from "./agent/tools/extended.js";
import { editFormatted, replyFormatted } from "./telegram/presentation.js";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
const histories = new Map<number, ChatCompletionMessageParam[]>();
const webhookPath = `/telegram/${config.WEBHOOK_SECRET}`;
const handleUpdate = webhookCallback(bot, "http", {
  secretToken: config.WEBHOOK_SECRET
});

const helpText = "<b>NallyHermes</b> — your AI assistant.\n\nI can answer questions, search the web, fetch pages, manage your workspace and memories, and create reminders.\n\n<b>Commands</b>\n/start — start the bot\n/help — show this help";

bot.command("start", async (ctx) => {
  await replyFormatted((text, options) => ctx.reply(text, options), "Hello! <b>NallyHermes</b> is ready. What can I help you with?");
});

bot.command("help", async (ctx) => {
  await replyFormatted((text, options) => ctx.reply(text, options), helpText);
});

bot.on("message:text", async (ctx) => {
  if (!ctx.from) return;
  await ctx.replyWithChatAction("typing");
  let progressMessageId: number | undefined;
  try {
    const telegramId = String(ctx.from.id);
    const progressMessage = await ctx.reply("Thinking…");
    progressMessageId = progressMessage.message_id;
    let lastStatus = "Thinking…";
    const onProgress = async (status: string): Promise<void> => {
      if (!status || status === lastStatus) return;
      try {
        await ctx.api.editMessageText(ctx.chat.id, progressMessageId!, status);
        lastStatus = status;
      } catch (error) {
        console.warn("Could not update agent progress message:", error);
      }
    };

    await db.insert(users).values({
      telegramId,
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name ?? null
    }).onConflictDoUpdate({
      target: users.telegramId,
      set: { username: ctx.from.username ?? null, firstName: ctx.from.first_name ?? null }
    });

    const history = histories.get(ctx.chat.id) ?? [];
    const answer = await respond(history, ctx.message.text, telegramId, onProgress);
    history.push({ role: "user", content: ctx.message.text }, { role: "assistant", content: answer });
    histories.set(ctx.chat.id, history.slice(-20));
    await editFormatted(
      (text, options) => ctx.api.editMessageText(ctx.chat.id, progressMessageId!, text, options),
      (text, options) => ctx.reply(text, options),
      answer
    );
  } catch (error) {
    console.error("Agent request failed:", error);
    const failure = "I ran into a problem processing that. Please try again shortly.";
    if (progressMessageId !== undefined) {
      try {
        await ctx.api.editMessageText(ctx.chat.id, progressMessageId, failure);
      } catch {
        await ctx.reply(failure);
      }
    } else {
      await ctx.reply(failure);
    }
  }
});

bot.catch((error) => console.error("Telegram bot error:", error));

console.info("Starting NallyHermes webhook server...");
await ensureDatabase();
await bot.api.setMyCommands([
  { command: "start", description: "Start NallyHermes" },
  { command: "help", description: "See what NallyHermes can do" }
]);

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
