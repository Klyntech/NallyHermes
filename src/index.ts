import { createServer } from "node:http";
import { Bot } from "grammy";
import { config } from "./config.js";
import { db, ensureDatabase } from "./db/client.js";
import { users } from "./db/schema.js";
import { respond } from "./agent/orchestrator.js";
import { checkMemoryPipeline, startScheduleWorker } from "./agent/tools/extended.js";
import { editFormatted, replyFormatted } from "./telegram/presentation.js";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
const histories = new Map<number, ChatCompletionMessageParam[]>();
const webhookPath = `/telegram/${config.WEBHOOK_SECRET}`;

const helpText = "<b>NallyHermes</b> — your AI assistant.\n\nI can answer questions, search the web, fetch pages, manage your workspace and memories, and create reminders.\n\n<b>Commands</b>\n/start — start the bot\n/help — show this help\n/memorycheck — test memory storage, retrieval and deletion";

bot.command("start", async (ctx) => {
  await replyFormatted((text, options) => ctx.reply(text, options), "Hello! <b>NallyHermes</b> is ready. What can I help you with?");
});

bot.command("help", async (ctx) => {
  await replyFormatted((text, options) => ctx.reply(text, options), helpText);
});

bot.command("memorycheck", async (ctx) => {
  if (!ctx.from) return;
  try {
    const result = await checkMemoryPipeline(String(ctx.from.id)) as {
      initialized: boolean; written: boolean; read: boolean;
      deleted: boolean; absent_after_delete: boolean; success: boolean;
    };
    const lines = [
      "<b>LightRAG pipeline check</b>",
      `Workspace initialized: ${result.initialized ? "PASS" : "FAIL"}`,
      `Temporary memory written: ${result.written ? "PASS" : "FAIL"}`,
      `Temporary memory retrieved: ${result.read ? "PASS" : "FAIL"}`,
      `Temporary memory deleted: ${result.deleted ? "PASS" : "FAIL"}`,
      `Absent after deletion: ${result.absent_after_delete ? "PASS" : "FAIL"}`,
      "",
      result.success ? "<b>Pipeline verified.</b>" : "<b>Pipeline check incomplete.</b> Check Render logs."
    ];
    await replyFormatted((text, options) => ctx.reply(text, options), lines.join("\n"));
  } catch (error) {
    console.error("LightRAG pipeline diagnostic failed:", error);
    await ctx.reply("Memory pipeline check failed. Check the Render logs for the LightRAG diagnostic error.");
  }
});

bot.on("message:text", async (ctx) => {
  if (!ctx.from) return;
  await ctx.replyWithChatAction("typing");
  let progressMessageId: number | undefined;
  let thinkingTimer: ReturnType<typeof setInterval> | undefined;
  try {
    const telegramId = String(ctx.from.id);
    const progressMessage = await ctx.reply("Thinking…");
    progressMessageId = progressMessage.message_id;
    let lastStatus = "Thinking…";
    let thinkingFrame = 0;
    const thinkingFrames = ["Thinking…", "Thinking.", "Thinking..", "Thinking..."];
    thinkingTimer = setInterval(() => {
      thinkingFrame = (thinkingFrame + 1) % thinkingFrames.length;
      const next = thinkingFrames[thinkingFrame]!;
      void ctx.api.editMessageText(ctx.chat.id, progressMessageId!, next).then(() => {
        lastStatus = next;
      }).catch((error) => console.warn("Could not animate thinking status:", error));
    }, 3000);
    const onProgress = async (status: string): Promise<void> => {
      if (!status || status === lastStatus) return;
      if (thinkingTimer) clearInterval(thinkingTimer);
      thinkingTimer = undefined;
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
    if (thinkingTimer) clearInterval(thinkingTimer);
    thinkingTimer = undefined;
    history.push({ role: "user", content: ctx.message.text }, { role: "assistant", content: answer });
    histories.set(ctx.chat.id, history.slice(-20));
    await editFormatted(
      (text, options) => ctx.api.editMessageText(ctx.chat.id, progressMessageId!, text, options),
      (text, options) => ctx.reply(text, options),
      answer
    );
  } catch (error) {
    if (thinkingTimer) clearInterval(thinkingTimer);
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
  { command: "help", description: "See what NallyHermes can do" },
  { command: "memorycheck", description: "Test memory storage, retrieval and deletion" }
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

  if (req.headers["x-telegram-bot-api-secret-token"] !== config.WEBHOOK_SECRET) {
    res.writeHead(401);
    res.end("Unauthorized");
    return;
  }

  void (async () => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 1_000_000) {
        res.writeHead(413);
        res.end("Payload too large");
        return;
      }
      chunks.push(buffer);
    }

    let update: Parameters<typeof bot.handleUpdate>[0];
    try {
      update = JSON.parse(Buffer.concat(chunks).toString("utf8")) as typeof update;
    } catch {
      res.writeHead(400);
      res.end("Invalid update");
      return;
    }

    // Acknowledge Telegram before running database or LightRAG work.
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("OK");
    void bot.handleUpdate(update).catch((error) => {
      console.error("Telegram update processing failed:", error);
    });
  })().catch((error) => {
    console.error("Telegram webhook request failed:", error);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end("Webhook processing failed");
    }
  });
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
