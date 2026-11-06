import { and, asc, eq, ilike, lte } from "drizzle-orm";
import { mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { db } from "../../db/client.js";
import { memories, scheduledJobs, users } from "../../db/schema.js";
import { config } from "../../config.js";
import { deleteMemory, diagnoseMemoryPipeline, indexMemory, retrieveMemory } from "../lightRag.js";
import type { ToolProgressReporter } from "../progress.js";

const MAX_FILE_BYTES = 1_000_000;
const MAX_FETCH_BYTES = 40_000;

function userWorkspace(telegramId: string): string {
  if (!/^\d{1,25}$/.test(telegramId)) throw new Error("Invalid user context.");
  return path.resolve(config.FILE_WORKSPACE, telegramId);
}

async function safePath(telegramId: string, relativePath: string, allowMissing = false): Promise<string> {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error("A relative workspace path is required.");
  const root = userWorkspace(telegramId);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("Path is outside your workspace.");
  await mkdir(root, { recursive: true });
  const parent = path.dirname(target);
  await mkdir(parent, { recursive: true });
  try {
    const resolved = await realpath(target);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error("Path is outside your workspace.");
    return resolved;
  } catch (error) {
    if (!allowMissing || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const resolvedParent = await realpath(parent);
    if (resolvedParent !== root && !resolvedParent.startsWith(root + path.sep)) throw new Error("Path is outside your workspace.");
    return target;
  }
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [first = -1, second = -1] = address.split(".").map(Number);
    return first === 10 || first === 127 || first === 0 || first >= 224 ||
      (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168);
  }
  const v = address.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") ||
    /^fe[89ab]/.test(v) || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.");
}

async function validatePublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only public HTTP(S) URLs are supported.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Private network addresses are not allowed.");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Private network addresses are not allowed.");
  }
  return url;
}

export async function fetchUrl(input: { url: string }, onProgress?: ToolProgressReporter): Promise<unknown> {
  let url = await validatePublicUrl(input.url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": "NallyHermes/1.0" },
      signal: AbortSignal.timeout(15_000)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Too many or invalid redirects.");
      url = await validatePublicUrl(new URL(location, url).toString());
      await onProgress?.({ type: "tool_progress", tool: "fetch", stage: "fetch_redirect" });
      continue;
    }
    if (!response.ok) throw new Error(`Fetch failed with HTTP ${response.status}.`);
    const type = response.headers.get("content-type") ?? "";
    if (!/(text\/|application\/(json|xml|javascript|xhtml\+xml))/.test(type)) {
      throw new Error("This tool only retrieves text-based web content.");
    }
    await onProgress?.({ type: "tool_progress", tool: "fetch", stage: "fetch_reading" });
    const text = await response.text();
    return { url: url.toString(), status: response.status, contentType: type, content: text.slice(0, MAX_FETCH_BYTES) };
  }
  throw new Error("Unable to fetch this URL.");
}

type FileInput = { operation: "read" | "write" | "edit" | "grep" | "delete" | "list" | "mkdir"; path: string; content?: string; search?: string; replace?: string };
export async function fileIO(telegramId: string, input: FileInput, onProgress?: ToolProgressReporter): Promise<unknown> {
  const target = await safePath(telegramId, input.path, ["write", "mkdir"].includes(input.operation));
  await onProgress?.({ type: "tool_progress", tool: "file_io", stage: "file_processing", operation: input.operation, path: input.path });
  switch (input.operation) {
    case "read": {
      const info = await stat(target);
      if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error("File is too large or not a regular file.");
      return { path: input.path, content: await readFile(target, "utf8") };
    }
    case "write": {
      if (typeof input.content !== "string" || Buffer.byteLength(input.content) > MAX_FILE_BYTES) throw new Error("Content is missing or exceeds the 1 MB limit.");
      await writeFile(target, input.content, { encoding: "utf8", flag: "w" });
      return { success: true, path: input.path };
    }
    case "edit": {
      if (!input.search || typeof input.replace !== "string") throw new Error("Both search and replace text are required.");
      const current = await readFile(target, "utf8");
      if (!current.includes(input.search)) throw new Error("The target text was not found.");
      const updated = current.replace(input.search, input.replace);
      if (Buffer.byteLength(updated) > MAX_FILE_BYTES) throw new Error("Edited file exceeds the 1 MB limit.");
      await writeFile(target, updated, "utf8");
      return { success: true, path: input.path };
    }
    case "delete":
      await rm(target, { recursive: false, force: false });
      return { success: true, path: input.path };
    case "mkdir":
      await mkdir(target, { recursive: true });
      return { success: true, path: input.path };
    case "list": {
      const entries = await readdir(target, { withFileTypes: true });
      return entries.slice(0, 200).map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" }));
    }
    case "grep": {
      if (!input.search) throw new Error("A search string is required.");
      const matches: Array<{ path: string; line: number; text: string }> = [];
      const walk = async (dir: string, prefix: string): Promise<void> => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          if (matches.length >= 100) return;
          const full = path.join(dir, entry.name);
          const relative = path.join(prefix, entry.name);
          if (entry.isDirectory()) await walk(full, relative);
          else if (entry.isFile() && (await stat(full)).size <= MAX_FILE_BYTES) {
            const lines = (await readFile(full, "utf8")).split(/\r?\n/);
            lines.forEach((line, index) => { if (line.includes(input.search!) && matches.length < 100) matches.push({ path: relative, line: index + 1, text: line.slice(0, 500) }); });
          }
        }
      };
      const info = await stat(target);
      if (info.isDirectory()) await walk(target, input.path);
      else {
        const lines = (await readFile(target, "utf8")).split(/\r?\n/);
        lines.forEach((line, index) => { if (line.includes(input.search!) && matches.length < 100) matches.push({ path: input.path, line: index + 1, text: line.slice(0, 500) }); });
      }
      return { matches };
    }
  }
}

async function getUserId(telegramId: string): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (!user) throw new Error("User profile is not ready yet.");
  return user.id;
}

const indexedMemoryUsers = new Set<string>();
const memorySyncJobs = new Map<string, Promise<void>>();

export async function syncUserMemories(telegramId: string, onProgress?: ToolProgressReporter): Promise<void> {
  if (!config.LIGHTRAG_ENABLED || indexedMemoryUsers.has(telegramId)) return;
  const existingJob = memorySyncJobs.get(telegramId);
  if (existingJob) return existingJob;

  const job = (async () => {
    const userId = await getUserId(telegramId);
    const rows = await db.select({ id: memories.id, content: memories.content })
      .from(memories).where(eq(memories.userId, userId));
    if (rows.length) await onProgress?.({ type: "tool_progress", tool: "memory", stage: "memory_indexing" });
    for (const memory of rows) {
      await indexMemory(telegramId, memory.id, memory.content);
    }
    indexedMemoryUsers.add(telegramId);
  })();

  memorySyncJobs.set(telegramId, job);
  try {
    await job;
  } finally {
    memorySyncJobs.delete(telegramId);
  }
}

type MemoryInput = { operation: "recall" | "remember" | "forget" | "update"; content?: string; id?: string; query?: string };
export async function memoryTool(telegramId: string, input: MemoryInput, onProgress?: ToolProgressReporter): Promise<unknown> {
  const userId = await getUserId(telegramId);
  switch (input.operation) {
    case "remember": {
      if (!input.content?.trim() || input.content.length > 4000) throw new Error("Memory content must be 1–4000 characters.");
      const [saved] = await db.insert(memories).values({ userId, content: input.content.trim() }).returning({ id: memories.id, content: memories.content });
      if (!saved) throw new Error("Memory could not be saved.");
      let indexed = false;
      try {
        if (config.LIGHTRAG_ENABLED) await onProgress?.({ type: "tool_progress", tool: "memory", stage: "memory_indexing" });
        indexed = await indexMemory(telegramId, saved.id, saved.content);
      }
      catch (error) { console.error("LightRAG memory indexing failed:", error); }
      return { ...saved, indexed };
    }
    case "recall": {
      const rows = await db.select({ id: memories.id, content: memories.content, updatedAt: memories.updatedAt })
        .from(memories).where(input.query ? and(eq(memories.userId, userId), ilike(memories.content, `%${input.query.slice(0, 100)}%`)) : eq(memories.userId, userId))
        .orderBy(asc(memories.createdAt)).limit(20);
      let semanticContext = "";
      if (input.query) {
        try {
          if (config.LIGHTRAG_ENABLED) await onProgress?.({ type: "tool_progress", tool: "memory", stage: "memory_retrieving" });
          semanticContext = await retrieveMemory(telegramId, input.query);
        }
        catch (error) { console.error("LightRAG memory retrieval failed:", error); }
      }
      return { memories: rows, semantic_context: semanticContext };
    }
    case "forget": {
      if (!input.id) throw new Error("Provide the memory ID to forget.");
      const [existing] = await db.select({ id: memories.id }).from(memories)
        .where(and(eq(memories.id, input.id), eq(memories.userId, userId))).limit(1);
      if (!existing) return { deleted: false };
      await deleteMemory(telegramId, input.id);
      const removed = await db.delete(memories).where(and(eq(memories.id, input.id), eq(memories.userId, userId))).returning({ id: memories.id });
      return { deleted: removed.length > 0 };
    }
    case "update": {
      if (!input.id || !input.content?.trim() || input.content.length > 4000) throw new Error("A memory ID and new content (1–4000 characters) are required.");
      const [existing] = await db.select({ id: memories.id }).from(memories)
        .where(and(eq(memories.id, input.id), eq(memories.userId, userId))).limit(1);
      if (!existing) return { updated: false };
      await deleteMemory(telegramId, input.id);
      const [updated] = await db.update(memories).set({ content: input.content.trim(), updatedAt: new Date() })
        .where(and(eq(memories.id, input.id), eq(memories.userId, userId))).returning({ id: memories.id, content: memories.content });
      if (!updated) return { updated: false };
      let indexed = false;
      try {
        if (config.LIGHTRAG_ENABLED) await onProgress?.({ type: "tool_progress", tool: "memory", stage: "memory_indexing" });
        indexed = await indexMemory(telegramId, updated.id, updated.content);
      }
      catch (error) { console.error("LightRAG memory re-indexing failed:", error); }
      return { ...updated, indexed };
    }
  }
}

type Recurrence = "daily" | "weekly" | "monthly";
type ScheduleInput = { operation: "create" | "list" | "cancel"; task?: string; run_at?: string; recurrence?: Recurrence; timezone?: string; id?: string };

function zonedParts(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function localTimeToUtc(parts: ReturnType<typeof zonedParts>, timezone: string): Date {
  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  for (let i = 0; i < 4; i++) {
    const actual = zonedParts(new Date(guess), timezone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    guess += desired - represented;
  }
  return new Date(guess);
}

function nextOccurrence(previous: Date, recurrence: Recurrence, timezone: string): Date {
  const parts = zonedParts(previous, timezone);
  if (recurrence === "daily" || recurrence === "weekly") {
    const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + (recurrence === "daily" ? 1 : 7)));
    parts.year = next.getUTCFullYear(); parts.month = next.getUTCMonth() + 1; parts.day = next.getUTCDate();
  } else {
    const year = parts.month === 12 ? parts.year + 1 : parts.year;
    const month = parts.month === 12 ? 1 : parts.month + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    parts.year = year; parts.month = month; parts.day = Math.min(parts.day, lastDay);
  }
  const next = localTimeToUtc(parts, timezone);
  if (next <= previous) throw new Error("Could not calculate the next recurring schedule.");
  return next;
}

export async function scheduleTool(telegramId: string, input: ScheduleInput, onProgress?: ToolProgressReporter): Promise<unknown> {
  const userId = await getUserId(telegramId);
  if (input.operation === "create") {
    if (!input.task?.trim() || input.task.length > 1000 || !input.run_at) throw new Error("A task and ISO-8601 date/time are required.");
    const runAt = new Date(input.run_at);
    if (!Number.isFinite(runAt.getTime()) || runAt <= new Date() || runAt.getTime() > Date.now() + 365 * 86400_000) throw new Error("The first run must be in the future and within one year.");
    let timezone: string | null = null;
    if (input.recurrence) {
      if (!["daily", "weekly", "monthly"].includes(input.recurrence)) throw new Error("Recurrence must be daily, weekly, or monthly.");
      if (!input.timezone) throw new Error("An IANA timezone is required for recurring schedules (for example, Africa/Lagos).");
      try { new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }); } catch { throw new Error("Invalid IANA timezone."); }
      timezone = input.timezone;
    }
    await onProgress?.({ type: "tool_progress", tool: "schedule", stage: "schedule_saving" });
    const [job] = await db.insert(scheduledJobs).values({ userId, task: input.task.trim(), runAt, recurrence: input.recurrence ?? null, timezone })
      .returning({ id: scheduledJobs.id, task: scheduledJobs.task, runAt: scheduledJobs.runAt, recurrence: scheduledJobs.recurrence, timezone: scheduledJobs.timezone });
    return job;
  }
  if (input.operation === "list") {
    return db.select({ id: scheduledJobs.id, task: scheduledJobs.task, runAt: scheduledJobs.runAt, recurrence: scheduledJobs.recurrence, timezone: scheduledJobs.timezone, status: scheduledJobs.status })
      .from(scheduledJobs).where(eq(scheduledJobs.userId, userId)).orderBy(asc(scheduledJobs.runAt)).limit(50);
  }
  if (!input.id) throw new Error("Provide the scheduled job ID to cancel.");
  const cancelled = await db.update(scheduledJobs).set({ status: "cancelled" })
    .where(and(eq(scheduledJobs.id, input.id), eq(scheduledJobs.userId, userId), eq(scheduledJobs.status, "pending"))).returning({ id: scheduledJobs.id });
  return { cancelled: cancelled.length > 0 };
}

export function startScheduleWorker(sendMessage: (telegramId: string, text: string) => Promise<unknown>): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const due = await db.select({ id: scheduledJobs.id, task: scheduledJobs.task, runAt: scheduledJobs.runAt, recurrence: scheduledJobs.recurrence, timezone: scheduledJobs.timezone, telegramId: users.telegramId })
        .from(scheduledJobs).innerJoin(users, eq(scheduledJobs.userId, users.id))
        .where(and(eq(scheduledJobs.status, "pending"), lte(scheduledJobs.runAt, new Date()))).orderBy(asc(scheduledJobs.runAt)).limit(20);
      for (const job of due) {
        const claimed = await db.update(scheduledJobs).set({ status: "sent" })
          .where(and(eq(scheduledJobs.id, job.id), eq(scheduledJobs.status, "pending"))).returning({ id: scheduledJobs.id });
        if (!claimed.length) continue;
        try {
          await sendMessage(job.telegramId, "⏰ Reminder: " + job.task);
          if (job.recurrence && job.timezone) {
            const nextRun = nextOccurrence(job.runAt, job.recurrence as Recurrence, job.timezone);
            await db.update(scheduledJobs).set({ runAt: nextRun, status: "pending" }).where(eq(scheduledJobs.id, job.id));
          }
        } catch (error) {
          await db.update(scheduledJobs).set({ status: "pending" }).where(eq(scheduledJobs.id, job.id));
          console.error("Reminder delivery or recurrence update failed:", error);
        }
      }
    } catch (error) { console.error("Schedule worker failed:", error); }
    finally { running = false; }
  };
  setInterval(() => { void tick(); }, 15_000);
  void tick();
}

export async function checkMemoryPipeline(telegramId: string): Promise<unknown> {
  return diagnoseMemoryPipeline(telegramId);
}
