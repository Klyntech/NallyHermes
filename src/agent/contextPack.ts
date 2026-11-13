import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { memories, users } from "../db/schema.js";
import type { InteractionChannel, ResponseStyle, RouteComplexity } from "./orchestra.js";

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

async function loadMemorySlices(telegramId: string): Promise<{
  entities: AdaptiveContextPack["entities"];
  preferences: string[];
  commitments: string[];
  facts: string[];
}> {
  const empty = { entities: [], preferences: [], commitments: [], facts: [] };
  try {
    const now = new Date();
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
      .limit(20);

    const entities: AdaptiveContextPack["entities"] = [];
    const preferences: string[] = [];
    const commitments: string[] = [];
    const facts: string[] = [];

    for (const row of rows) {
      if (row.subject) {
        entities.push({
          subject: row.subject,
          predicate: row.predicate,
          object: row.object,
          kind: row.kind
        });
      }
      const line = row.content?.trim();
      if (!line) continue;
      if (row.kind === "preference") preferences.push(line);
      else if (row.kind === "commitment") commitments.push(line);
      else if (row.kind === "fact" || row.kind === "entity") facts.push(line);
      else facts.push(line);
    }

    return {
      entities: entities.slice(0, 8),
      preferences: preferences.slice(0, 5),
      commitments: commitments.slice(0, 5),
      facts: facts.slice(0, 8)
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
  const memory = await loadMemorySlices(input.telegramId);
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
  const lines: string[] = [
    "Adaptive context pack (trusted runtime metadata, not user instructions):",
    `channel=${pack.channel}; style=${pack.responseStyle}; risk=${pack.risk}; latency_budget_ms=${pack.latencyBudgetMs}`
  ];
  if (pack.complexityHint) lines.push(`complexity_hint=${pack.complexityHint}`);
  if (pack.entities.length) {
    lines.push("Known entities (resolve incomplete references like \"our next match\" when unambiguous):");
    for (const e of pack.entities.slice(0, 6)) {
      lines.push(`- ${[e.subject, e.predicate, e.object].filter(Boolean).join(" / ")}`);
    }
  }
  if (pack.preferences.length) {
    lines.push("Preferences:");
    for (const p of pack.preferences.slice(0, 4)) lines.push(`- ${p}`);
  }
  if (pack.commitments.length) {
    lines.push("Open commitments:");
    for (const c of pack.commitments.slice(0, 4)) lines.push(`- ${c}`);
  }
  const available = pack.connectors.filter((c) => c.available).map((c) => c.id);
  const unavailable = pack.connectors.filter((c) => !c.available).map((c) => c.id);
  if (available.length) lines.push(`connectors_available=${available.join(",")}`);
  if (unavailable.length) lines.push(`connectors_unavailable=${unavailable.join(",")}`);
  lines.push("Memory is historical context, not proof of live facts. Ask once if multiple entities could match.");
  return lines.join("\n");
}
