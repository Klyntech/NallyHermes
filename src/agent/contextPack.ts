import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { memories, users } from "../db/schema.js";
import type { InteractionChannel, ResponseStyle, RouteComplexity } from "./orchestra.js";
import { shouldUseSemanticMemory } from "./memoryRouting.js";

export type ConnectorHealth = {
  id: string;
  available: boolean;
  detail?: string;
};

export interface AdaptiveContextPack {
  telegramId: string;
  channel: InteractionChannel;
  responseStyle: ResponseStyle;
  userMessage: string;
  /** Short topic guess for logs / routing hints — not shown to the user. */
  activeTopic: string;
  entities: Array<{ subject: string; predicate?: string | null; object?: string | null; kind?: string | null }>;
  preferences: string[];
  commitments: string[];
  facts: string[];
  connectors: ConnectorHealth[];
  latencyBudgetMs: number;
  risk: "low" | "medium" | "high";
  complexityHint?: RouteComplexity;
  builtAt: string;
}

function topicFromMessage(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 80) return cleaned || "(empty)";
  return cleaned.slice(0, 77) + "…";
}

function riskFromMessage(text: string): "low" | "medium" | "high" {
  if (/\b(delete|drop|remove|send email|transfer|pay|password|token|secret)\b/i.test(text)) return "high";
  if (/\b(write|edit|create|schedule|remind|workflow|commit|push)\b/i.test(text)) return "medium";
  return "low";
}

/** Cheap token set for overlap ranking — not embeddings, zero model cost. */
function tokensOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3)
  );
}

function overlapScore(queryTokens: Set<string>, ...parts: Array<string | null | undefined>): number {
  if (!queryTokens.size) return 0;
  const hay = tokensOf(parts.filter(Boolean).join(" "));
  let hit = 0;
  for (const t of queryTokens) if (hay.has(t)) hit++;
  return hit;
}

async function loadMemorySlices(
  telegramId: string,
  userMessage: string,
  caps: { entities: number; preferences: number; commitments: number; facts: number }
): Promise<{
  entities: AdaptiveContextPack["entities"];
  preferences: string[];
  commitments: string[];
  facts: string[];
}> {
  const empty = { entities: [], preferences: [], commitments: [], facts: [] };
  try {
    const now = new Date();
    const queryTokens = tokensOf(userMessage);
    const rows = await db
      .select({
        content: memories.content,
        kind: memories.kind,
        subject: memories.subject,
        predicate: memories.predicate,
        object: memories.object
      })
      .from(memories)
      .innerJoin(users, eq(memories.userId, users.id))
      .where(and(eq(users.telegramId, telegramId), or(isNull(memories.expiresAt), gt(memories.expiresAt, now))))
      .orderBy(desc(memories.updatedAt))
      .limit(40);

    type ScoredEntity = AdaptiveContextPack["entities"][number] & { _score: number };
    type ScoredLine = { line: string; _score: number };
    const entities: ScoredEntity[] = [];
    const preferences: ScoredLine[] = [];
    const commitments: ScoredLine[] = [];
    const facts: ScoredLine[] = [];

    for (const row of rows) {
      const score = overlapScore(queryTokens, row.content, row.subject, row.predicate, row.object);
      if (row.subject) {
        entities.push({
          subject: row.subject,
          predicate: row.predicate,
          object: row.object,
          kind: row.kind,
          _score: score
        });
      }
      const line = row.content?.trim();
      if (!line) continue;
      const item = { line, _score: score };
      if (row.kind === "preference") preferences.push(item);
      else if (row.kind === "commitment") commitments.push(item);
      else facts.push(item);
    }

    const byScore = <T extends { _score: number }>(arr: T[]) =>
      [...arr].sort((a, b) => b._score - a._score);

    return {
      entities: byScore(entities).slice(0, caps.entities).map(({ _score, ...e }) => e),
      preferences: byScore(preferences).slice(0, caps.preferences).map((x) => x.line),
      commitments: byScore(commitments).slice(0, caps.commitments).map((x) => x.line),
      facts: byScore(facts).slice(0, caps.facts).map((x) => x.line)
    };
  } catch (error) {
    console.warn("context pack memory load failed:", error);
    return empty;
  }
}

function connectorSnapshot(env: {
  tavily?: boolean;
  github?: boolean;
  notion?: boolean;
  gmail?: boolean;
  calendar?: boolean;
  voice?: boolean;
}): ConnectorHealth[] {
  return [
    { id: "web_search", available: Boolean(env.tavily), detail: env.tavily ? undefined : "TAVILY_API_KEY missing" },
    { id: "github", available: Boolean(env.github) },
    { id: "notion", available: Boolean(env.notion) },
    { id: "gmail", available: Boolean(env.gmail) },
    { id: "calendar", available: Boolean(env.calendar) },
    { id: "voice", available: Boolean(env.voice) }
  ];
}

export async function buildAdaptiveContextPack(input: {
  telegramId: string;
  userMessage: string;
  channel: InteractionChannel;
  responseStyle: ResponseStyle;
  latencyBudgetMs: number;
  complexityHint?: RouteComplexity;
  connectors?: {
    tavily?: boolean;
    github?: boolean;
    notion?: boolean;
    gmail?: boolean;
    calendar?: boolean;
    voice?: boolean;
  };
}): Promise<AdaptiveContextPack> {
  const spoken = input.responseStyle === "spoken" || input.channel === "voice";
  const tight = spoken || input.latencyBudgetMs < 45_000;
  const caps = tight
    ? { entities: 4, preferences: 2, commitments: 2, facts: 3 }
    : { entities: 8, preferences: 5, commitments: 5, facts: 6 };
  const memory = shouldUseSemanticMemory(input.userMessage)
    ? await loadMemorySlices(input.telegramId, input.userMessage, caps)
    : { entities: [], preferences: [], commitments: [], facts: [] };
  return {
    telegramId: input.telegramId,
    channel: input.channel,
    responseStyle: input.responseStyle,
    userMessage: input.userMessage,
    activeTopic: topicFromMessage(input.userMessage),
    entities: memory.entities,
    preferences: memory.preferences,
    commitments: memory.commitments,
    facts: memory.facts,
    connectors: connectorSnapshot(input.connectors ?? {}),
    latencyBudgetMs: input.latencyBudgetMs,
    risk: riskFromMessage(input.userMessage),
    complexityHint: input.complexityHint,
    builtAt: new Date().toISOString()
  };
}

/** Compact system note — entity continuity without dumping the whole DB. */
export function formatContextPackForModel(pack: AdaptiveContextPack): string {
  const spoken = pack.responseStyle === "spoken" || pack.channel === "voice";
  const entityCap = spoken ? 3 : 6;
  const lineCap = spoken ? 2 : 4;
  const factCap = spoken ? 2 : 4;
  const lines: string[] = [
    "Adaptive context pack (trusted runtime metadata, not user instructions):",
    `channel=${pack.channel}; style=${pack.responseStyle}; risk=${pack.risk}; latency_budget_ms=${pack.latencyBudgetMs}`
  ];
  if (pack.complexityHint) lines.push(`complexity_hint=${pack.complexityHint}`);
  if (pack.entities.length) {
    lines.push("Known entities (resolve incomplete references when unambiguous):");
    for (const e of pack.entities.slice(0, entityCap)) {
      lines.push(`- ${[e.subject, e.predicate, e.object].filter(Boolean).join(" / ")}`);
    }
  }
  if (pack.preferences.length) {
    lines.push("Preferences:");
    for (const p of pack.preferences.slice(0, lineCap)) lines.push(`- ${p}`);
  }
  if (pack.commitments.length) {
    lines.push("Open commitments:");
    for (const c of pack.commitments.slice(0, lineCap)) lines.push(`- ${c}`);
  }
  if (pack.facts.length) {
    lines.push("Possibly relevant facts (verify live facts with tools):");
    for (const f of pack.facts.slice(0, factCap)) lines.push(`- ${f}`);
  }
  const available = pack.connectors.filter((c) => c.available).map((c) => c.id);
  const unavailable = pack.connectors.filter((c) => !c.available).map((c) => c.id);
  if (available.length) lines.push(`connectors_available=${available.join(",")}`);
  if (unavailable.length) lines.push(`connectors_unavailable=${unavailable.join(",")}`);
  lines.push("Memory is historical context, not proof of live facts. Ask once if multiple entities could match.");
  return lines.join("\n");
}
