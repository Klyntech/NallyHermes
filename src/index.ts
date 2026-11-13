import { createServer } from "node:http";
import { Bot, InputFile } from "grammy";
import { config } from "./config.js";
import { db, ensureDatabase } from "./db/client.js";
import { users } from "./db/schema.js";
import { appendConversationExchange, getOrCreateConversation, loadConversationHistory } from "./db/conversationStore.js";
import { respond } from "./agent/orchestrator.js";
import { isVoiceConfigured, speechToText, prepareSpokenDelivery } from "./agent/voice/index.js";
import { normalizeTelegramAudio, readResponseWithLimit } from "./agent/voice/audio.js";
import { checkMemoryPipeline, startScheduleWorker } from "./agent/tools/extended.js";
import { startWorkflowWorker } from "./agent/workflows.js";
import { editFormatted, replyFormatted } from "./telegram/presentation.js";
import { formatIngestionGuidance, looksLikeStructuredLabel, parseIngestionCaption } from "./telegram/ingestionMeta.js";
import { benchmarkRerankers } from "./agent/lightRag.js";
import { displayProgress } from "./agent/progress.js";
import { getDefaultTimezone, getUserTimezone, setUserTimezone } from "./agent/clock.js";
import type { ProgressEvent } from "./agent/progress.js";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { ingestAcademicDocument } from "./academic/ingestion.js";
import { updateAcademicDocumentMetadata } from "./academic/store.js";

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
const histories = new Map<string, ChatCompletionMessageParam[]>();
const MAX_ACTIVE_CONVERSATIONS = 1_000;
const processedDocumentUpdates = new Map<string, number>();
const DOCUMENT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1_000;
const processedVoiceUpdates = new Map<string, number>();
const VOICE_DEDUPE_TTL_MS = 24 * 60 * 60 * 1_000;

type PendingLabel = { documentId: string; telegramId: string; fileName?: string; expiresAt: number; pendingKey: string };

/** Maps bot confirmation message_id → document so reply-to labeling works. */
const pendingIngestionLabels = new Map<string, PendingLabel>();
/** Most recent pending document per chat:user — used when the user labels without tapping Reply. */
const latestPendingByUser = new Map<string, PendingLabel>();
const PENDING_LABEL_TTL_MS = 2 * 60 * 60 * 1_000;
function pruneVoiceUpdates(now = Date.now()): void {
  for (const [key, timestamp] of processedVoiceUpdates) {
    if (timestamp + VOICE_DEDUPE_TTL_MS <= now) processedVoiceUpdates.delete(key);
  }
}

function prunePendingLabels(now = Date.now()): void {
  for (const [key, entry] of pendingIngestionLabels) {
    if (entry.expiresAt <= now) pendingIngestionLabels.delete(key);
  }
  for (const [key, entry] of latestPendingByUser) {
    if (entry.expiresAt <= now) latestPendingByUser.delete(key);
  }
}

function userPendingKey(chatId: number, telegramId: string): string {
  return `${chatId}:${telegramId}`;
}

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

async function applyPendingLabel(
  pending: PendingLabel,
  labelText: string
): Promise<{ ok: true; title: string; course: string | null } | { ok: false; error: string }> {
  try {
    const meta = parseIngestionCaption(labelText, pending.fileName);
    const updated = await updateAcademicDocumentMetadata(pending.telegramId, pending.documentId, {
      title: meta.title,
      course: meta.course ?? null
    });
    pendingIngestionLabels.delete(pending.pendingKey);
    for (const [key, entry] of latestPendingByUser) {
      if (entry.documentId === pending.documentId) latestPendingByUser.delete(key);
    }
    if (!updated) return { ok: false, error: "I couldn't find that document to update. Please send the PDF again with a caption." };
    return { ok: true, title: updated.title, course: updated.course };
  } catch (error) {
    console.error("Ingestion metadata enrichment failed:", error);
    return { ok: false, error: error instanceof Error ? `I couldn't update those labels: ${error.message}` : "I couldn't update those labels." };
  }
}

const webhookPath = `/telegram/${config.WEBHOOK_SECRET}`;

const helpText = "# NallyHermes\nYour AI assistant.\n\nI can answer questions, search the web, fetch pages, manage your workspace and memories, and create reminders.\n\n## Commands\n/start — start the bot\n/help — show this help\n/memorycheck — test memory storage, retrieval and deletion\n/rerankbench — benchmark NVIDIA reranker latency\n/timezone — view or set your timezone";

bot.command("start", async (ctx) => {
  await replyFormatted({
    rich: (rich_message) =>
      "replyWithRichMessage" in ctx && typeof (ctx as { replyWithRichMessage?: Function }).replyWithRichMessage === "function"
        ? (ctx as { replyWithRichMessage: (m: unknown) => Promise<unknown> }).replyWithRichMessage(rich_message)
        : ctx.api.sendRichMessage(ctx.chat.id, rich_message),
    html: (text, options) => ctx.reply(text, options)
  }, "Hello! **NallyHermes** is ready. What can I help you with?");
});

bot.command("help", async (ctx) => {
  await replyFormatted({
    rich: (rich_message) =>
      "replyWithRichMessage" in ctx && typeof (ctx as { replyWithRichMessage?: Function }).replyWithRichMessage === "function"
        ? (ctx as { replyWithRichMessage: (m: unknown) => Promise<unknown> }).replyWithRichMessage(rich_message)
        : ctx.api.sendRichMessage(ctx.chat.id, rich_message),
    html: (text, options) => ctx.reply(text, options)
  }, helpText);
});

bot.command("ingest", async (ctx) => {
  await ctx.reply("Send me a PDF as a document. Caption it with `Course: Tort | Title: Negligence lecture 3`, or send the file first and then send the same labels (reply optional).");
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
    await replyFormatted({
    rich: (rich_message) =>
      "replyWithRichMessage" in ctx && typeof (ctx as { replyWithRichMessage?: Function }).replyWithRichMessage === "function"
        ? (ctx as { replyWithRichMessage: (m: unknown) => Promise<unknown> }).replyWithRichMessage(rich_message)
        : ctx.api.sendRichMessage(ctx.chat.id, rich_message),
    html: (text, options) => ctx.reply(text, options)
  }, lines.join("\n"));
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
    await replyFormatted({
    rich: (rich_message) =>
      "replyWithRichMessage" in ctx && typeof (ctx as { replyWithRichMessage?: Function }).replyWithRichMessage === "function"
        ? (ctx as { replyWithRichMessage: (m: unknown) => Promise<unknown> }).replyWithRichMessage(rich_message)
        : ctx.api.sendRichMessage(ctx.chat.id, rich_message),
    html: (text, options) => ctx.reply(text, options)
  }, "## NVIDIA reranker benchmark\n\n" + lines.slice(1).join("\n"));
  } catch (error) {
    console.error("Reranker benchmark failed:", error);
    await ctx.reply("Benchmark failed. Check Render logs and NIM configuration.");
  }
});

bot.on("message:document", async (ctx) => {
  if (!ctx.from) return;
  const document = ctx.message.document;
  const updateKey = `${ctx.chat.id}:${ctx.message.message_id}`;
  const now = Date.now();
  for (const [key, seenAt] of processedDocumentUpdates) {
    if (now - seenAt > DOCUMENT_DEDUPE_TTL_MS) processedDocumentUpdates.delete(key);
  }
  if (processedDocumentUpdates.has(updateKey)) return;
  processedDocumentUpdates.set(updateKey, now);
  if (document.mime_type !== "application/pdf" && !document.file_name?.toLowerCase().endsWith(".pdf")) {
    await ctx.reply("I can ingest PDF documents for the academic library right now. Send a PDF as a document.");
    return;
  }
  try {
    const telegramId = String(ctx.from.id);
    await db.insert(users).values({ telegramId, username: ctx.from.username ?? null, firstName: ctx.from.first_name ?? null, timezone: getDefaultTimezone() }).onConflictDoUpdate({ target: users.telegramId, set: { username: ctx.from.username ?? null, firstName: ctx.from.first_name ?? null } });
    const file = await ctx.api.getFile(document.file_id);
    if (!file.file_path) throw new Error("Telegram did not return a downloadable file path.");
    const response = await fetch(`https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Telegram file download failed with HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > config.INGESTION_MAX_UPLOAD_BYTES) throw new Error(`That PDF is larger than the ${Math.round(config.INGESTION_MAX_UPLOAD_BYTES / 1_000_000)} MB ingestion limit.`);

    // Caption is optional at upload time. Metadata is parsed separately so a
    // follow-up message can still label the document after the file is stored.
    const meta = parseIngestionCaption(ctx.message.caption, document.file_name);
    const saved = await ingestAcademicDocument(telegramId, {
      title: meta.title,
      course: meta.course,
      sourceType: "telegram_pdf",
      fileName: document.file_name ?? "academic-document.pdf",
      mimeType: document.mime_type ?? "application/pdf",
      base64: bytes.toString("base64")
    });

    if (meta.fromCaption) {
      await ctx.reply(`Ingested “${meta.title}”. Status: ${saved.status}${meta.course ? ` · ${meta.course}` : ""}.${saved.error ? `\n\nDetail: ${saved.error}` : ""}`);
    } else {
      const guidance = await ctx.reply(
        `Ingested using the filename (“${meta.title}”). Status: ${saved.status}.${saved.error ? `\n\nDetail: ${saved.error}` : ""}\n\n${formatIngestionGuidance(document.file_name)}`
      );
      prunePendingLabels();
      const pending: PendingLabel = {
        documentId: saved.id,
        telegramId,
        fileName: document.file_name ?? undefined,
        expiresAt: Date.now() + PENDING_LABEL_TTL_MS,
        pendingKey: `${ctx.chat.id}:${guidance.message_id}`
      };
      pendingIngestionLabels.set(pending.pendingKey, pending);
      latestPendingByUser.set(userPendingKey(ctx.chat.id, telegramId), pending);
    }
  } catch (error) {
    console.error("Telegram academic ingestion failed:", error);
    await ctx.reply(error instanceof Error ? `I couldn't ingest that PDF: ${error.message}` : "I couldn't ingest that PDF.");
  }
});


bot.on(["message:voice", "message:audio"], async (ctx) => {
  if (!ctx.from) return;

  pruneVoiceUpdates();
  const voiceUpdateKey = `${ctx.chat.id}:${ctx.message.message_id}`;
  if (processedVoiceUpdates.has(voiceUpdateKey)) return;
  processedVoiceUpdates.set(voiceUpdateKey, Date.now());

  if (!isVoiceConfigured()) {
    await ctx.reply("Voice is not enabled on this bot yet. Send a text message, or ask Clinton to set VOICE_ENABLED with Deepgram and ElevenLabs keys.");
    return;
  }

  const telegramId = String(ctx.from.id);
  const historyKey = conversationKey(ctx.chat.id, ctx.from.id);
  const voice = ctx.message.voice ?? ctx.message.audio;
  if (!voice) return;

  const declaredDurationSec = ctx.message.voice?.duration ?? ctx.message.audio?.duration;
  if (declaredDurationSec !== undefined && declaredDurationSec > config.VOICE_MAX_DURATION_SEC) {
    await ctx.reply(`That voice note is longer than the ${config.VOICE_MAX_DURATION_SEC}-second limit. Try a shorter one.`);
    return;
  }

  if (voice.file_size && voice.file_size > config.VOICE_MAX_AUDIO_BYTES) {
    await ctx.reply("That voice note is too large for me to transcribe. Try a shorter one.");
    return;
  }

  await serializeConversation(historyKey, async () => {
    let statusId: number | undefined;
    try {
      const status = await ctx.reply("Listening…");
      statusId = status.message_id;
      await ctx.replyWithChatAction("typing");

      const file = await ctx.getFile();
      if (!file.file_path) {
        await ctx.api.editMessageText(ctx.chat.id, statusId, "I could not download that voice note.");
        return;
      }
      const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const audioRes = await fetch(fileUrl, { signal: AbortSignal.timeout(30_000) });
      if (!audioRes.ok) {
        await ctx.api.editMessageText(ctx.chat.id, statusId, "I could not download that voice note from Telegram.");
        return;
      }
      const downloaded = await readResponseWithLimit(audioRes, config.VOICE_MAX_AUDIO_BYTES);
      const normalized = await normalizeTelegramAudio(downloaded, {
        maxInputBytes: config.VOICE_MAX_AUDIO_BYTES,
        maxOutputBytes: config.VOICE_MAX_AUDIO_BYTES * 2,
        timeoutMs: config.VOICE_AUDIO_PROCESS_TIMEOUT_MS
      });
      if (normalized.durationSec !== null && normalized.durationSec > config.VOICE_MAX_DURATION_SEC) {
        await ctx.api.editMessageText(ctx.chat.id, statusId, `That voice note is longer than the ${config.VOICE_MAX_DURATION_SEC}-second limit. Try a shorter one.`);
        return;
      }
      let transcriptText: string;
      try {
        const transcript = await speechToText(normalized.audio, normalized.mimeType);
        transcriptText = transcript.text;
      } catch (error) {
        console.error("STT failed:", error);
        await ctx.api.editMessageText(
          ctx.chat.id,
          statusId,
          "I could not hear that clearly. Please try again or send it as text."
        );
        return;
      }

      await ctx.api.editMessageText(ctx.chat.id, statusId, "Working…");

      const conversationId = await getOrCreateConversation(telegramId, String(ctx.chat.id));
      const persistedHistory = await loadConversationHistory(conversationId);
      const history = persistedHistory.length ? persistedHistory : getHistory(historyKey);

      const answer = await respond(history, transcriptText, telegramId, undefined, undefined, undefined, {
        channel: "voice",
        responseStyle: "spoken",
        conversationId
      });

      await appendConversationExchange(conversationId, transcriptText, answer);
      history.push({ role: "user", content: transcriptText }, { role: "assistant", content: answer });
      saveHistory(historyKey, history);

              try {
        const { split, speech } = await prepareSpokenDelivery(answer);
        const heard = transcriptText.length > 120 ? transcriptText.slice(0, 117) + "…" : transcriptText;
        const textSupplement = split.text.trim();
        await ctx.api.editMessageText(
          ctx.chat.id,
          statusId,
          `Heard: “${heard}”`
        );
        await ctx.replyWithAudio(new InputFile(speech.audio, `nally-reply.${speech.extension}`), {
          caption: split.spoken.length > 900 ? split.spoken.slice(0, 897) + "…" : split.spoken
        });
        // Text channel only when the model (or fallback) produced unspeakable detail
        if (textSupplement) {
          await ctx.reply(textSupplement.slice(0, 3500));
        }
      } catch (error) {
        console.error("TTS failed:", error);
        await ctx.api.editMessageText(ctx.chat.id, statusId, answer.slice(0, 3500) || "Done, but speech playback failed.");
      }
    } catch (error) {
      console.error("Voice message handling failed:", error);
      if (statusId !== undefined) {
        try {
          await ctx.api.editMessageText(ctx.chat.id, statusId, "Something went wrong with that voice note. Try text for now.");
        } catch {
          /* ignore */
        }
      } else {
        await ctx.reply("Something went wrong with that voice note. Try text for now.");
      }
    }
  });
});

bot.on("message:text", async (ctx) => {
  if (!ctx.from) return;

  const telegramId = String(ctx.from.id);
  prunePendingLabels();

  // 1) Explicit reply-to the bot's confirmation message.
  const replyToId = ctx.message.reply_to_message?.message_id;
  if (replyToId !== undefined) {
    const pending = pendingIngestionLabels.get(`${ctx.chat.id}:${replyToId}`);
    if (pending && pending.telegramId === telegramId) {
      const result = await applyPendingLabel(pending, ctx.message.text);
      if (result.ok) {
        await ctx.reply(`Updated labels: “${result.title}”${result.course ? ` · ${result.course}` : ""}.`);
      } else {
        await ctx.reply(result.error);
      }
      return;
    }
  }

  // 2) Structured Course:/Title: message without reply — apply to latest pending PDF for this user.
  if (looksLikeStructuredLabel(ctx.message.text)) {
    const pending = latestPendingByUser.get(userPendingKey(ctx.chat.id, telegramId));
    if (pending && pending.telegramId === telegramId) {
      const result = await applyPendingLabel(pending, ctx.message.text);
      if (result.ok) {
        await ctx.reply(`Updated labels: “${result.title}”${result.course ? ` · ${result.course}` : ""}.`);
      } else {
        await ctx.reply(result.error);
      }
      return;
    }
  }

  const historyKey = conversationKey(ctx.chat.id, ctx.from.id);
  await serializeConversation(historyKey, async () => {
    await ctx.replyWithChatAction("typing");
    let progressMessageId: number | undefined;
    let thinkingTimer: ReturnType<typeof setInterval> | undefined;
    let closeProgress: (() => Promise<void>) | undefined;
    try {
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

      const conversationId = await getOrCreateConversation(telegramId, String(ctx.chat.id));
      const persistedHistory = await loadConversationHistory(conversationId);
      const history = persistedHistory.length ? persistedHistory : getHistory(historyKey);
      const answer = await respond(history, ctx.message.text, telegramId, onProgress);
      await closeProgress();
      await appendConversationExchange(conversationId, ctx.message.text, answer);
      history.push({ role: "user", content: ctx.message.text }, { role: "assistant", content: answer });
      saveHistory(historyKey, history);
      await editFormatted(
        {
          rich: (rich_message) =>
            // Bot API 10.1+: rich_message on editMessageText (text omitted)
            (ctx.api as { raw: { editMessageText: (p: Record<string, unknown>) => Promise<unknown> } }).raw.editMessageText({
              chat_id: ctx.chat.id,
              message_id: progressMessageId!,
              rich_message
            }),
          html: (text, options) => ctx.api.editMessageText(ctx.chat.id, progressMessageId!, text, options)
        },
        {
          rich: (rich_message) =>
            "replyWithRichMessage" in ctx && typeof (ctx as { replyWithRichMessage?: Function }).replyWithRichMessage === "function"
              ? (ctx as { replyWithRichMessage: (m: unknown) => Promise<unknown> }).replyWithRichMessage(rich_message)
              : ctx.api.sendRichMessage(ctx.chat.id, rich_message),
          html: (text, options) => ctx.reply(text, options)
        },
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
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (pathname === "/manus-routes.json" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ routes: [{ path: "/ingestion", title: "Nally Academic Companion" }] }));
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

startWorkflowWorker(
  async (workflow) => {
    const allowedTools = new Set(workflow.allowedTools);
    const policy = [
      "This is an automated recurring workflow run, not blanket approval for external mutations.",
      `Workflow name: ${workflow.name}`,
      `Approval policy: ${workflow.approvalPolicy}`,
      `Only use these allowed tools: ${workflow.allowedTools.join(", ") || "none"}.`,
      "Never perform a mutation automatically during a scheduled run. If a mutation is needed, report that explicit user confirmation is required and do not claim it happened.",
      "Produce a concise report of completed work, evidence, and any limitation.",
      workflow.instructions
    ].join("\n\n");
    return respond([], policy, workflow.telegramId, undefined, allowedTools, workflow.approvalPolicy as "read_only" | "confirm_mutations");
  },
  async (telegramId, message) => {
    await bot.api.sendMessage(Number(telegramId), "Workflow report\n\n" + message);
  }
);
