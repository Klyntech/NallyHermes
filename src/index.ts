import { createServer } from "node:http";
import { Bot } from "grammy";
import { config } from "./config.js";
import { db, ensureDatabase } from "./db/client.js";
import { users } from "./db/schema.js";
import { respond } from "./agent/orchestrator.js";
import { checkMemoryPipeline, startScheduleWorker } from "./agent/tools/extended.js";
import { editFormatted, replyFormatted } from "./telegram/presentation.js";
import { benchmarkRerankers } from "./agent/lightRag.js";
import { displayProgress } from "./agent/progress.js";
import { getDefaultTimezone, getUserTimezone, setUserTimezone } from "./agent/clock.js";
import type { ProgressEvent } from "./agent/progress.js";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { createVoiceAuthHandler } from "./voice/http-auth.js";
import { verifyVoiceSessionCookie } from "./voice/telegram-auth.js";
import { VoiceWebSocketGateway } from "./voice/gateway.js";

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
const histories = new Map<string, ChatCompletionMessageParam[]>();
const MAX_ACTIVE_CONVERSATIONS = 1_000;

function conversationKey(chatId: number, userId: number): string {
  // A group chat has one private history per participant; it never shares
  // context with another participant or the user's private chat.
  return `${chatId}:${userId}`;
}

function getHistory(key: string): ChatCompletionMessageParam[] {
  const history = histories.get(key) ?? [];
  // Refresh insertion order so the map behaves as a small LRU cache.
  histories.delete(key);
  histories.set(key, history);
  return history;
}

function saveHistory(key: string, history: ChatCompletionMessageParam[]): void {
  histories.delete(key);
  histories.set(key, history.slice(-20));
  while (histories.size > MAX_ACTIVE_CONVERSATIONS) {
    const oldest = histories.keys().next().value;
    if (oldest === undefined) break;
    histories.delete(oldest);
  }
}
const conversationQueues = new Map<string, Promise<void>>();

async function serializeConversation<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = conversationQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.catch(() => undefined).then(() => current);
  conversationQueues.set(key, queued);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (conversationQueues.get(key) === queued) conversationQueues.delete(key);
  }
}

const webhookPath = `/telegram/${config.WEBHOOK_SECRET}`;

const publicOrigin = new URL(config.WEBHOOK_URL).origin;
const voiceAuthHandler = createVoiceAuthHandler({
  botToken: config.TELEGRAM_BOT_TOKEN,
  botUsername: bot.botInfo.username,
  origin: publicOrigin,
  persistIdentity: async (identity) => {
    await db.insert(users).values({
      telegramId: identity.userId,
      username: identity.username ?? null,
      firstName: identity.firstName ?? null,
      timezone: getDefaultTimezone()
    }).onConflictDoUpdate({
      target: users.telegramId,
      set: { username: identity.username ?? null, firstName: identity.firstName ?? null }
    });
  }
});

const voiceGateway = new VoiceWebSocketGateway({
  allowedOrigins: new Set([publicOrigin]),
  authenticate: async (request) => {
    const identity = verifyVoiceSessionCookie(request.headers.cookie, {
      botToken: config.TELEGRAM_BOT_TOKEN
    });
    return identity ? { userId: identity.userId } : null;
  }
});

const helpText = "# NallyHermes\nYour AI assistant.\n\nI can answer questions, search the web, fetch pages, manage your workspace and memories, and create reminders.\n\n## Commands\n/start — start the bot\n/help — show this help\n/memorycheck — test memory storage, retrieval and deletion\n/rerankbench — benchmark NVIDIA reranker latency\n/timezone — view or set your timezone";

bot.command("start", async (ctx) => {
  await replyFormatted((text, options) => ctx.reply(text, options), "Hello! **NallyHermes** is ready. What can I help you with?");
});

bot.command("help", async (ctx) => {
  await replyFormatted((text, options) => ctx.reply(text, options), helpText);
});

bot.command("timezone", async (ctx) => {
  if (!ctx.from) return;
  const telegramId = String(ctx.from.id);
  await db.insert(users).values({
    telegramId,
    username: ctx.from.username ?? null,
    firstName: ctx.from.first_name ?? null,
    timezone: getDefaultTimezone()
  }).onConflictDoUpdate({
    target: users.telegramId,
    set: { username: ctx.from.username ?? null, firstName: ctx.from.first_name ?? null }
  });

  const requested = String(ctx.match ?? "").trim();
  if (!requested) {
    const timezone = await getUserTimezone(telegramId);
    await ctx.reply("Your timezone is " + timezone + ". To change it, send /timezone Europe/London (use an IANA timezone).");
    return;
  }
  try {
    await setUserTimezone(telegramId, requested);
    await ctx.reply("Timezone updated to " + requested + ". Relative dates and reminders will use this timezone.");
  } catch (error) {
    await ctx.reply(error instanceof Error ? error.message : "Could not update timezone.");
  }
});

bot.command("memorycheck", async (ctx) => {
  if (!ctx.from) return;
  try {
    const result = await checkMemoryPipeline(String(ctx.from.id)) as {
      initialized: boolean; written: boolean; read: boolean;
      deleted: boolean; absent_after_delete: boolean; success: boolean;
    };
    const lines = [
      "# LightRAG pipeline check",
      `Workspace initialized: ${result.initialized ? "PASS" : "FAIL"}`,
      `Temporary memory written: ${result.written ? "PASS" : "FAIL"}`,
      `Temporary memory retrieved: ${result.read ? "PASS" : "FAIL"}`,
      `Temporary memory deleted: ${result.deleted ? "PASS" : "FAIL"}`,
      `Absent after deletion: ${result.absent_after_delete ? "PASS" : "FAIL"}`,
      "",
      result.success ? "**Pipeline verified.**" : "**Pipeline check incomplete.** Check Render logs."
    ];
    await replyFormatted((text, options) => ctx.reply(text, options), lines.join("\n"));
  } catch (error) {
    console.error("LightRAG pipeline diagnostic failed:", error);
    await ctx.reply("Memory pipeline check failed. Check the Render logs for the LightRAG diagnostic error.");
  }
});

bot.command("rerankbench", async (ctx) => {
  await ctx.reply("Benchmarking rerankers…");
  try {
    const result = await benchmarkRerankers();
    const lines = ["NVIDIA reranker benchmark", "Passages: " + result.query_passages];
    for (const [model, endpoint] of Object.entries(result.endpoints)) lines.push(model + " endpoint: " + endpoint);
    for (const [model, metrics] of Object.entries(result.results)) {
      lines.push(model);
      if (metrics.ok) {
        lines.push(
          "Median: " + metrics.median_ms + " ms",
          "P95: " + metrics.p95_ms + " ms",
          "Returned: " + (metrics.returned ?? "unknown") + " rankings"
        );
        if (metrics.response_keys?.length) lines.push("Response fields: " + metrics.response_keys.join(", "));
        for (const item of (metrics.ranking_preview ?? []).slice(0, 6)) {
          const score = typeof item.score === "number" ? " [" + item.score + "]" : "";
          lines.push("#" + item.index + score + ": " + (item.passage ?? "Passage text unavailable"));
        }
      } else lines.push("FAILED: " + (metrics.error || "No successful response; inspect Render logs"));
    }
    await replyFormatted((text, options) => ctx.reply(text, options), "## NVIDIA reranker benchmark\n\n" + lines.slice(1).join("\n"));
  } catch (error) {
    console.error("Reranker benchmark failed:", error);
    await ctx.reply("Benchmark failed. Check Render logs and NIM configuration.");
  }
});

bot.on("message:text", async (ctx) => {
  if (!ctx.from) return;
  const historyKey = conversationKey(ctx.chat.id, ctx.from.id);
  await serializeConversation(historyKey, async () => {
    await ctx.replyWithChatAction("typing");
    let progressMessageId: number | undefined;
    let thinkingTimer: ReturnType<typeof setInterval> | undefined;
    let closeProgress: (() => Promise<void>) | undefined;
    try {
      const telegramId = String(ctx.from.id);
      const progressMessage = await ctx.reply("Thinking…");
      progressMessageId = progressMessage.message_id;
      let lastStatus = "Thinking…";
      let thinkingFrame = 0;
      let progressRevision = 0;
      let progressQueue: Promise<void> = Promise.resolve();
      let progressClosed = false;
      const thinkingFrames = ["Thinking…", "Thinking.", "Thinking..", "Thinking..."];
      const stopThinkingAnimation = () => {
        if (thinkingTimer) clearInterval(thinkingTimer);
        thinkingTimer = undefined;
      };
      const queueProgressEdit = (status: string, revision: number): Promise<void> => {
        progressQueue = progressQueue.then(async () => {
          if (progressClosed || revision !== progressRevision || status === lastStatus) return;
          try {
            await ctx.api.editMessageText(ctx.chat.id, progressMessageId!, status);
            lastStatus = status;
          } catch (error) {
            console.warn("Could not update agent progress message:", error);
          }
        });
        return progressQueue;
      };
      const showProgress = (status: string, animateThinking = false): Promise<void> => {
        stopThinkingAnimation();
        const revision = ++progressRevision;
        const update = queueProgressEdit(status, revision);
        if (animateThinking) {
          void update.then(() => {
            if (progressClosed || revision !== progressRevision) return;
            thinkingTimer = setInterval(() => {
              thinkingFrame = (thinkingFrame + 1) % thinkingFrames.length;
              void queueProgressEdit(thinkingFrames[thinkingFrame]!, revision);
            }, 3000);
          });
        }
        return update;
      };
      closeProgress = async () => {
        stopThinkingAnimation();
        progressClosed = true;
        progressRevision++;
        await progressQueue;
      };
      const onProgress = async (event: ProgressEvent): Promise<void> => {
        const display = displayProgress(event);
        if (display) await showProgress(display.text, display.animateThinking);
      };
      await showProgress("Thinking…", true);

      await db.insert(users).values({
        telegramId,
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name ?? null,
        timezone: getDefaultTimezone()
      }).onConflictDoUpdate({
        target: users.telegramId,
        set: { username: ctx.from.username ?? null, firstName: ctx.from.first_name ?? null }
      });

      const history = getHistory(historyKey);
      const answer = await respond(history, ctx.message.text, telegramId, onProgress);
      await closeProgress();
      history.push({ role: "user", content: ctx.message.text }, { role: "assistant", content: answer });
      saveHistory(historyKey, history);
      await editFormatted(
        (text, options) => ctx.api.editMessageText(ctx.chat.id, progressMessageId!, text, options),
        (text, options) => ctx.reply(text, options),
        answer
      );
    } catch (error) {
      if (closeProgress) await closeProgress();
      else if (thinkingTimer) clearInterval(thinkingTimer);
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
});

bot.catch((error) => console.error("Telegram bot error:", error));

console.info("Starting NallyHermes webhook server...");
await ensureDatabase();
await bot.init();
await bot.api.setMyCommands([
  { command: "start", description: "Start NallyHermes" },
  { command: "help", description: "See what NallyHermes can do" },
  { command: "timezone", description: "View or change your timezone" },
  { command: "memorycheck", description: "Test memory storage, retrieval and deletion" },
  { command: "rerankbench", description: "Benchmark NVIDIA reranker latency" }
]);

const server = createServer((req, res) => {
  if (req.url?.startsWith("/auth/")) {
    void voiceAuthHandler(req, res).then((handled) => {
      if (!handled && !res.headersSent) {
        res.writeHead(404);
        res.end("Not found");
      }
    }).catch((error) => {
      console.error("Voice authentication route failed:", error);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Authentication service unavailable");
      }
    });
    return;
  }
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

server.on("upgrade", voiceGateway.handleUpgrade);

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
