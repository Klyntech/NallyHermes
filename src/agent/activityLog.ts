/**
 * Cross-session activity log (P0–P4 continuity).
 * Episodes + dated weekly summaries + working state.
 * Application-written; the model only narrates what is stored.
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { db } from "../db/client.js";
import { activityEpisodes, activityWeekSummaries, userWorkingState, users } from "../db/schema.js";

const MAX_TOPICS = 5;
const MAX_TOOLS = 12;
const MAX_INTENT = 280;
const MAX_ACTION = 280;

export function utcDateString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Monday UTC of the ISO-ish week containing dateStr (YYYY-MM-DD). */
export function weekStartMondayUtc(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function weekEndSundayUtc(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}


const NOISE_TOPICS = new Set(
  "try check show list work set how hey yeah ok okay update confirm message section create".split(" ")
);

function meaningfulTopics(topics: string[]): string[] {
  return topics.filter((t) => {
    const low = t.toLowerCase();
    if (NOISE_TOPICS.has(low)) return false;
    if (low.length <= 2) return false;
    return true;
  });
}

/** Turn raw episode intents into a short human summary — not a DB readout. */
export function narrateWeek(
  weekStart: string,
  weekEnd: string,
  intents: string[],
  topics: string[]
): string {
  const cleanTopics = meaningfulTopics(topics).slice(0, 6);
  const samples = intents
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 8 && !/^(ok|okay|thanks|yes|no|hey)\b/i.test(s))
    .slice(0, 12);

  const bits: string[] = [];
  // Theme sentences from topics
  const themeBits: string[] = [];
  if (cleanTopics.some((t) => /nally|hermes|repo|github|v4|dev/i.test(t))) {
    themeBits.push("building and iterating on Nally/Hermes");
  }
  if (cleanTopics.some((t) => /football|madrid|liga|match/i.test(t))) {
    themeBits.push("football and Real Madrid scores or fixtures");
  }
  if (cleanTopics.some((t) => /deskdear|desktop/i.test(t))) {
    themeBits.push("DeskDear / desktop plans");
  }
  if (cleanTopics.some((t) => /email|gmail/i.test(t))) {
    themeBits.push("email");
  }
  if (cleanTopics.some((t) => /schedul|remind|calendar/i.test(t))) {
    themeBits.push("scheduling and reminders");
  }
  if (cleanTopics.some((t) => /voice/i.test(t))) {
    themeBits.push("voice");
  }
  if (themeBits.length) {
    bits.push(`Mostly ${themeBits.join("; ")}.`);
  } else if (cleanTopics.length) {
    bits.push(`Themes included ${cleanTopics.slice(0, 4).join(", ")}.`);
  }

  // Concrete snippets from user asks (paraphrase-ish: keep short)
  const concrete = samples
    .filter((s) => !/^(show|list|check|try|create)\b/i.test(s) || s.length > 25)
    .slice(0, 3)
    .map((s) => (s.length > 90 ? s.slice(0, 87) + "…" : s));
  if (concrete.length) {
    bits.push(`Things you asked about included: ${concrete.join("; ")}.`);
  }

  if (!bits.length) {
    return `During ${weekStart} to ${weekEnd} you and Nally talked across several days, but the log only has short messages — no detailed project trail.`;
  }

  return `From ${weekStart} to ${weekEnd}, ${bits.join(" ")}`;
}


function extractTopics(text: string): string[] {
  const topics: string[] = [];
  const lower = text.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/\b(la liga|real madrid|champions league|match|football|soccer)\b/i, "football"],
    [/\b(github|repo|pull request|commit|branch|v4|hermes|nally)\b/i, "nally-dev"],
    [/\b(deskdear|desktop)\b/i, "deskdear"],
    [/\b(gmail|email|inbox)\b/i, "email"],
    [/\b(calendar|schedule|remind)\b/i, "scheduling"],
    [/\b(memory|remember)\b/i, "memory"],
    [/\b(voice|speak|tts)\b/i, "voice"],
    [/\b(price|pricing|cost)\b/i, "pricing"],
    [/\b(weather)\b/i, "weather"]
  ];
  for (const [re, label] of rules) {
    if (re.test(text)) topics.push(label);
  }
  // Proper-noun-ish tokens
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g)) {
    const s = m[1]!.trim();
    if (s.length >= 3 && s.length <= 40 && !/^(The|This|That|What|When|Please|Hello|Thanks)\b/.test(s)) {
      topics.push(s);
    }
  }
  return [...new Set(topics)].slice(0, MAX_TOPICS);
}

function toolsFromMessages(messages: ChatCompletionMessageParam[]): string[] {
  const tools: string[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const calls = (message as { tool_calls?: Array<{ function?: { name?: string } }> }).tool_calls;
    if (!calls) continue;
    for (const call of calls) {
      const name = call.function?.name;
      if (name) tools.push(name);
    }
  }
  return [...new Set(tools)].slice(0, MAX_TOOLS);
}

function lastAssistantText(messages: ChatCompletionMessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "assistant" && typeof m.content === "string" && m.content.trim()) {
      return m.content.trim().slice(0, MAX_ACTION);
    }
  }
  return "";
}

async function getUserId(telegramId: string): Promise<string | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
  return row?.id ?? null;
}

export type RecordEpisodeInput = {
  telegramId: string;
  userMessage: string;
  messages: ChatCompletionMessageParam[];
  channel?: string;
  outcome?: string;
  completed?: boolean;
};

/** P0: append episode; refresh working state; roll weekly summary. */
export async function recordActivityEpisode(input: RecordEpisodeInput): Promise<void> {
  if (!input.completed) return;
  const text = input.userMessage.trim();
  if (text.length < 2) return;
  // Skip pure acknowledgements
  if (/^(ok|okay|thanks|thank you|yes|no|k|cool|great)\.?$/i.test(text)) return;

  try {
    const userId = await getUserId(input.telegramId);
    if (!userId) return;

    const now = new Date();
    const activityDate = utcDateString(now);
    const topics = extractTopics(text);
    const tools = toolsFromMessages(input.messages);
    const userIntent = text.slice(0, MAX_INTENT);
    const nallyAction = lastAssistantText(input.messages) || null;
    const outcome = input.outcome ?? (tools.length ? "answered_with_tools" : "answered");

    await db.insert(activityEpisodes).values({
      userId,
      telegramId: input.telegramId,
      channel: input.channel ?? "telegram",
      occurredAt: now,
      activityDate,
      topics,
      tools,
      userIntent,
      nallyAction,
      outcome,
      refs: []
    });

    await touchWorkingState(userId, input.telegramId, topics, text);
    await refreshWeekSummary(userId, input.telegramId, activityDate);
  } catch (error) {
    console.warn("activity.record_failed", error instanceof Error ? error.message : error);
  }
}

async function touchWorkingState(
  userId: string,
  telegramId: string,
  topics: string[],
  userMessage: string
): Promise<void> {
  const openLoop =
    /\b(later|remind me|don'?t forget|waiting (?:on|for)|todo|follow up)\b/i.test(userMessage)
      ? userMessage.slice(0, 160)
      : null;

  const [existing] = await db
    .select()
    .from(userWorkingState)
    .where(eq(userWorkingState.userId, userId))
    .limit(1);

  const lastTopics = [...new Set([...(topics || []), ...((existing?.lastTopics as string[]) ?? [])])].slice(0, 8);
  const activeProjects = [...new Set([
    ...((existing?.activeProjects as string[]) ?? []),
    ...topics.filter((t) => ["nally-dev", "deskdear", "football"].includes(t) || /^[A-Z]/.test(t))
  ])].slice(0, 6);
  const openLoops = openLoop
    ? [...new Set([openLoop, ...((existing?.openLoops as string[]) ?? [])])].slice(0, 6)
    : ((existing?.openLoops as string[]) ?? []).slice(0, 6);

  if (existing) {
    await db
      .update(userWorkingState)
      .set({ lastTopics, activeProjects, openLoops, telegramId, updatedAt: new Date() })
      .where(eq(userWorkingState.userId, userId));
  } else {
    await db.insert(userWorkingState).values({
      userId,
      telegramId,
      lastTopics,
      activeProjects,
      openLoops
    });
  }
}

/** Rebuild weekly summary for the week containing activityDate. */
export async function refreshWeekSummary(
  userId: string,
  telegramId: string,
  activityDate: string
): Promise<void> {
  const weekStart = weekStartMondayUtc(activityDate);
  const weekEnd = weekEndSundayUtc(weekStart);

  const rows = await db
    .select({
      activityDate: activityEpisodes.activityDate,
      topics: activityEpisodes.topics,
      userIntent: activityEpisodes.userIntent,
      tools: activityEpisodes.tools
    })
    .from(activityEpisodes)
    .where(
      and(
        eq(activityEpisodes.userId, userId),
        gte(activityEpisodes.activityDate, weekStart),
        lte(activityEpisodes.activityDate, weekEnd)
      )
    )
    .orderBy(activityEpisodes.occurredAt)
    .limit(200);

  const topicCount = new Map<string, number>();
  const dayBreakdown: Record<string, string[]> = {};
  const intents: string[] = [];
  for (const row of rows) {
    const day = row.activityDate;
    if (!dayBreakdown[day]) dayBreakdown[day] = [];
    const label = (row.userIntent || "").slice(0, 120);
    if (label) {
      intents.push(label);
      if (dayBreakdown[day]!.length < 6) dayBreakdown[day]!.push(label);
    }
    for (const t of (row.topics as string[]) ?? []) {
      topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
    }
  }

  const topics = [...topicCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .slice(0, 12);

  const summary = narrateWeek(weekStart, weekEnd, intents, topics);

  const [existing] = await db
    .select({ id: activityWeekSummaries.id })
    .from(activityWeekSummaries)
    .where(and(eq(activityWeekSummaries.userId, userId), eq(activityWeekSummaries.weekStart, weekStart)))
    .limit(1);

  if (existing) {
    await db
      .update(activityWeekSummaries)
      .set({
        weekEnd,
        episodeCount: rows.length,
        topics,
        summary,
        dayBreakdown,
        updatedAt: new Date(),
        telegramId
      })
      .where(eq(activityWeekSummaries.id, existing.id));
  } else {
    await db.insert(activityWeekSummaries).values({
      userId,
      telegramId,
      weekStart,
      weekEnd,
      episodeCount: rows.length,
      topics,
      summary,
      dayBreakdown
    });
  }
}

export async function loadWorkingState(telegramId: string): Promise<{
  activeProjects: string[];
  openLoops: string[];
  lastTopics: string[];
} | null> {
  try {
    const [row] = await db
      .select()
      .from(userWorkingState)
      .where(eq(userWorkingState.telegramId, telegramId))
      .limit(1);
    if (!row) return null;
    return {
      activeProjects: (row.activeProjects as string[]) ?? [],
      openLoops: (row.openLoops as string[]) ?? [],
      lastTopics: (row.lastTopics as string[]) ?? []
    };
  } catch {
    return null;
  }
}

/** Recent week summaries for context pack (dated). */
export async function loadRecentWeekSummaries(telegramId: string, limit = 4): Promise<
  Array<{ weekStart: string; weekEnd: string; summary: string; topics: string[]; episodeCount: number }>
> {
  try {
    const rows = await db
      .select({
        weekStart: activityWeekSummaries.weekStart,
        weekEnd: activityWeekSummaries.weekEnd,
        summary: activityWeekSummaries.summary,
        topics: activityWeekSummaries.topics,
        episodeCount: activityWeekSummaries.episodeCount
      })
      .from(activityWeekSummaries)
      .where(eq(activityWeekSummaries.telegramId, telegramId))
      .orderBy(desc(activityWeekSummaries.weekStart))
      .limit(limit);
    return rows.map((r) => ({
      weekStart: r.weekStart,
      weekEnd: r.weekEnd,
      summary: r.summary,
      topics: (r.topics as string[]) ?? [],
      episodeCount: r.episodeCount
    }));
  } catch {
    return [];
  }
}

/** Episodes in a date range (inclusive YYYY-MM-DD). */
export async function recallEpisodes(
  telegramId: string,
  opts: { sinceDate?: string; untilDate?: string; limit?: number; query?: string } = {}
): Promise<
  Array<{
    date: string;
    at: string;
    intent: string;
    action: string | null;
    topics: string[];
    tools: string[];
    outcome: string;
  }>
> {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const conditions = [eq(activityEpisodes.telegramId, telegramId)];
  if (opts.sinceDate) conditions.push(gte(activityEpisodes.activityDate, opts.sinceDate));
  if (opts.untilDate) conditions.push(lte(activityEpisodes.activityDate, opts.untilDate));

  let rows = await db
    .select({
      activityDate: activityEpisodes.activityDate,
      occurredAt: activityEpisodes.occurredAt,
      userIntent: activityEpisodes.userIntent,
      nallyAction: activityEpisodes.nallyAction,
      topics: activityEpisodes.topics,
      tools: activityEpisodes.tools,
      outcome: activityEpisodes.outcome
    })
    .from(activityEpisodes)
    .where(and(...conditions))
    .orderBy(desc(activityEpisodes.occurredAt))
    .limit(limit * 2);

  if (opts.query?.trim()) {
    const q = opts.query.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.userIntent.toLowerCase().includes(q) ||
        (r.nallyAction ?? "").toLowerCase().includes(q) ||
        ((r.topics as string[]) ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }

  return rows.slice(0, limit).map((r) => ({
    date: r.activityDate,
    at: r.occurredAt instanceof Date ? r.occurredAt.toISOString() : String(r.occurredAt),
    intent: r.userIntent,
    action: r.nallyAction,
    topics: (r.topics as string[]) ?? [],
    tools: (r.tools as string[]) ?? [],
    outcome: r.outcome
  }));
}

export async function activityTool(
  telegramId: string,
  input: {
    operation: "recall" | "weeks" | "working_state";
    since_date?: string;
    until_date?: string;
    query?: string;
    limit?: number;
  }
): Promise<unknown> {
  if (input.operation === "working_state") {
    const state = await loadWorkingState(telegramId);
    return {
      working_state: state,
      note: "Application-maintained continuity state. Empty means not enough history yet."
    };
  }
  if (input.operation === "weeks") {
    const weeks = await loadRecentWeekSummaries(telegramId, input.limit ?? 8);
    return {
      weeks,
      note:
        "Narrate naturally for the user: what you worked on together that week, in plain language. " +
        "Do not say episode counts, database fields, or topic tag lists. Use week_start/week_end only if they ask when. " +
        "Ground every claim in summary and day_breakdown intents."
    };
  }
  // default recall
  let since = input.since_date;
  if (!since && !input.until_date) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    since = utcDateString(d);
  }
  const episodes = await recallEpisodes(telegramId, {
    sinceDate: since,
    untilDate: input.until_date,
    limit: input.limit ?? 25,
    query: input.query
  });
  return {
    since: since ?? null,
    until: input.until_date ?? null,
    count: episodes.length,
    episodes,
    note:
      episodes.length === 0
        ? "No stored episodes in this range. Do not invent past activity."
        : "Tell the story of what the user asked and what you did together. No episode counts, no raw DB jargon."
  };
}
