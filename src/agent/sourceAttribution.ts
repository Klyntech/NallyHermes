import type { ChatCompletionMessageParam } from "openai/resources/index.js";

export type AnswerSource = {
  kind: "web" | "academic";
  title: string;
  url?: string;
  course?: string | null;
  documentId?: string;
};

type FunctionCall = { id?: string; type?: string; function?: { name?: string } };

function safeWebUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4_000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function displayTitle(value: unknown, fallback: string): string {
  const title = typeof value === "string"
    ? value.replace(/[\r\n\t]+/g, " ").replace(/[\\`*_\[\]~]/g, "").trim()
    : "";
  return (title || fallback).slice(0, 180);
}

function parseToolResult(content: unknown): Record<string, unknown> | null {
  if (typeof content !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/** Extract only sources actually returned by the current turn's tools. */
export function extractAnswerSources(messages: ChatCompletionMessageParam[]): AnswerSource[] {
  const toolNames = new Map<string, string>();
  const sources: AnswerSource[] = [];
  const keys = new Set<string>();

  const add = (source: AnswerSource) => {
    const key = source.url
      ? `url:${source.url.toLowerCase().replace(/#.*$/, "")}`
      : `academic:${source.documentId ?? `${source.title}:${source.course ?? ""}`}`;
    if (keys.has(key)) return;
    keys.add(key);
    sources.push(source);
  };

  for (const message of messages) {
    if (message.role === "assistant") {
      const calls = (message as unknown as { tool_calls?: FunctionCall[] }).tool_calls ?? [];
      for (const call of calls) {
        if (call.id && call.function?.name) toolNames.set(call.id, call.function.name);
      }
      continue;
    }
    if (message.role !== "tool") continue;
    const toolCallId = (message as unknown as { tool_call_id?: string }).tool_call_id;
    const toolName = toolCallId ? toolNames.get(toolCallId) : undefined;
    const payload = parseToolResult((message as unknown as { content?: unknown }).content);
    if (!payload || !toolName) continue;

    if (toolName === "web_search" && Array.isArray(payload.results)) {
      for (const item of payload.results) {
        if (!item || typeof item !== "object") continue;
        const hit = item as Record<string, unknown>;
        const url = safeWebUrl(hit.url);
        if (!url) continue;
        add({ kind: "web", title: displayTitle(hit.title, new URL(url).hostname), url });
      }
    }

    if (toolName === "fetch") {
      const url = safeWebUrl(payload.url);
      if (url) add({ kind: "web", title: displayTitle(payload.title, new URL(url).hostname), url });
    }

    if (toolName === "academic" && Array.isArray(payload.sources)) {
      for (const item of payload.sources) {
        if (!item || typeof item !== "object") continue;
        const source = item as Record<string, unknown>;
        const title = displayTitle(source.title, "Academic document");
        const course = typeof source.course === "string" ? displayTitle(source.course, "") || null : null;
        const documentId = typeof source.document_id === "string" ? source.document_id : undefined;
        add({ kind: "academic", title, course, documentId });
      }
    }
  }

  return sources.slice(0, 8);
}

function cleanModelAnswer(answer: string): string {
  let lines = answer.trim().split(/\r?\n/);
  const sourceHeading = lines.findIndex((line) =>
    /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:sources?|references?)\s*(?:\*\*)?\s*:?[ \t]*$/i.test(line)
  );
  if (sourceHeading >= 0) lines = lines.slice(0, sourceHeading);
  lines = lines.filter((line) => !/^\s*(?:\*\*)?source\s*\/\s*last\s*checked\s*:?/i.test(line));
  let cleaned = lines.join("\n").trim();
  cleaned = cleaned.replace(
    /^\s*(?:(?:result|coverage)\s*:\s*)?(?:\*\*)?partial(?:\*\*)?\s*[:—–-]\s*/i,
    "I could verify part of this: "
  );
  cleaned = cleaned.replace(/^\s*(?:(?:result|coverage)\s*:\s*)?(?:\*\*)?complete(?:\*\*)?\s*[:—–-]\s*/i, "");
  return cleaned;
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/** Add a readable footer with clickable web links and plainly named library sources. */
export function appendSourcesFooter(answer: string, sources: AnswerSource[]): string {
  const body = cleanModelAnswer(answer) || "I couldn't generate a response. Please try again.";
  if (!sources.length) return body;

  const uniqueSources: AnswerSource[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const key = source.url
      ? `url:${source.url.toLowerCase().replace(/#.*$/, "")}`
      : `academic:${source.documentId ?? `${source.title}:${source.course ?? ""}`}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueSources.push(source);
    if (uniqueSources.length >= 8) break;
  }
  const items = uniqueSources.map((source) => {
    if (source.kind === "web" && source.url) {
      return `- [${escapeMarkdownLabel(source.title)}](${source.url.replace(/[()]/g, (match) => match === "(" ? "%28" : "%29")})`;
    }
    const suffix = source.course ? ` — ${source.course}` : "";
    return `- ${escapeMarkdownLabel(source.title)}${suffix ? escapeMarkdownLabel(suffix) : ""}`;
  });
  return `${body}\n\n**Sources**\n${items.join("\n")}`;
}


/** Split a stored assistant answer into body + structured sources (from appendSourcesFooter). */
export function splitAnswerAndSources(answer: string): { body: string; sources: AnswerSource[] } {
  const lines = answer.replace(/\r\n/g, "\n").split("\n");
  const heading = lines.findIndex((line) =>
    /^\s*(?:\*\*)?sources?(?:\*\*)?\s*$/i.test(line.trim()) ||
    /^\s*(?:\*\*)?sources?(?:\*\*)?\s*:?\s*$/i.test(line.trim())
  );
  if (heading < 0) {
    return { body: answer.trim(), sources: [] };
  }
  const body = lines.slice(0, heading).join("\n").trim();
  const sources: AnswerSource[] = [];
  const seen = new Set<string>();
  for (const raw of lines.slice(heading + 1)) {
    const line = raw.trim();
    if (!line || line === "---") continue;
    const link = /^\s*[-*]\s*\[([^\]]+)\]\((https?:[^)\s]+)\)\s*$/i.exec(line);
    if (link) {
      const title = displayTitle(link[1], "Source");
      const url = safeWebUrl(link[2]);
      if (!url) continue;
      const key = `url:${url.toLowerCase().replace(/#.*$/, "")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ kind: "web", title, url });
      continue;
    }
    const plain = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (plain) {
      const title = displayTitle(plain[1], "Academic document");
      const key = `academic:${title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ kind: "academic", title });
    }
  }
  return { body: body || answer.trim(), sources: sources.slice(0, 8) };
}
