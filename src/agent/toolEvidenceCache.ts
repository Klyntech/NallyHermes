import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import type { ToolCallInput } from "./executor.js";

type ToolMessage = Extract<ChatCompletionMessageParam, { role: "tool" }>;
interface CacheEntry { call: ToolCallInput; result: ToolMessage }

const STOP_WORDS = new Set(["a","an","and","are","as","at","by","for","from","find","get","in","is","it","of","on","or","the","to","via","with","about","official","site","web","search"]);

function isCacheableRead(call: ToolCallInput): boolean {
  const args = argsOf(call);
  if (!args) return false;
  switch (call.function.name) {
    case "web_search":
      return typeof args.query === "string" && args.query.trim().length > 0 &&
        (args.max_results === undefined || (Number.isInteger(args.max_results) && Number(args.max_results) >= 1 && Number(args.max_results) <= 10));
    case "fetch":
      return typeof args.url === "string" && Boolean(canonicalUrl(args.url));
    case "file_io":
      return ["read", "list", "grep"].includes(String(args.operation)) &&
        typeof args.path === "string" && args.path.trim().length > 0;
    case "memory":
      return args.operation === "recall";
    case "schedule":
      return args.operation === "list";
    default:
      return false;
  }
}

function argsOf(call: ToolCallInput): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(call.function.arguments);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().replaceAll("https://", "").replaceAll("http://", "").replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function similarQuery(left: string, right: string): boolean {
  const a = tokens(left), b = tokens(right);
  if (a.size < 3 || b.size < 3) return false;
  const overlap = [...a].filter((token) => b.has(token)).length;
  const containment = overlap / Math.min(a.size, b.size);
  const sizeRatio = Math.min(a.size, b.size) / Math.max(a.size, b.size);
  return containment >= 0.8 && sizeRatio >= 0.55;
}

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) while (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch { return null; }
}

function equivalent(left: ToolCallInput, right: ToolCallInput): boolean {
  if (left.function.name !== right.function.name) return false;
  const a = argsOf(left), b = argsOf(right);
  if (!a || !b) return false;
  switch (left.function.name) {
    case "web_search":
      return Number(a.max_results ?? 8) === Number(b.max_results ?? 8) &&
        typeof a.query === "string" && typeof b.query === "string" && similarQuery(a.query, b.query);
    case "fetch":
      return typeof a.url === "string" && typeof b.url === "string" &&
        canonicalUrl(a.url) === canonicalUrl(b.url);
    case "memory":
      return a.operation === "recall" && b.operation === "recall" &&
        typeof a.query === "string" && typeof b.query === "string" && similarQuery(a.query, b.query);
    case "file_io":
      return ["read","list","grep"].includes(String(a.operation)) &&
        a.operation === b.operation && a.path === b.path && a.search === b.search;
    default:
      return false;
  }
}

function successful(result: ToolMessage): boolean {
  try {
    const value = JSON.parse(String(result.content)) as { error?: unknown };
    return !value || typeof value !== "object" || !("error" in value);
  } catch { return false; }
}

function reusedResult(call: ToolCallInput, source: ToolMessage): ToolMessage {
  let result: unknown;
  try { result = JSON.parse(String(source.content)); }
  catch { result = String(source.content); }
  const content = result && typeof result === "object" && !Array.isArray(result)
    ? { ...(result as Record<string, unknown>), _reused_read_result_from: source.tool_call_id }
    : { data: result, _reused_read_result_from: source.tool_call_id };
  return { role: "tool", tool_call_id: call.id, content: JSON.stringify(content) };
}

/**
 * Request-scoped read cache. Only successful read-only calls are retained.
 * Similar web/memory queries use conservative token containment; writes and
 * mutations are never cached or deduplicated.
 */
export class ToolEvidenceCache {
  private readonly entries: CacheEntry[] = [];

  find(call: ToolCallInput): ToolMessage | undefined {
    if (!isCacheableRead(call)) return undefined;
    const match = this.entries.find((entry) => equivalent(call, entry.call));
    return match ? reusedResult(call, match.result) : undefined;
  }

  remember(call: ToolCallInput, result: ToolMessage): void {
    if (!isCacheableRead(call) || !successful(result) || this.find(call)) return;
    this.entries.push({ call: { ...call }, result: { ...result } });
  }

  async execute(
    calls: ToolCallInput[],
    operation: (uniqueCalls: ToolCallInput[]) => Promise<ToolMessage[]>
  ): Promise<{ results: ToolMessage[]; reusedCount: number; executedCount: number }> {
    const unique: ToolCallInput[] = [];
    const known = new Map<string, ToolMessage>();
    const leaderFor = new Map<string, string>();
    const byId = new Map(calls.map((call) => [call.id, call]));

    for (const call of calls) {
      const cached = this.find(call);
      if (cached) {
        known.set(call.id, cached);
        continue;
      }
      const leader = unique.find((candidate) => equivalent(call, candidate));
      if (leader) {
        leaderFor.set(call.id, leader.id);
      } else {
        unique.push(call);
      }
    }

    const executed = unique.length ? await operation(unique) : [];
    const executedById = new Map(executed.map((result) => [result.tool_call_id, result]));
    for (const call of unique) {
      const result = executedById.get(call.id);
      if (result) {
        known.set(call.id, result);
        this.remember(call, result);
      }
    }

    for (const [duplicateId, leaderId] of leaderFor) {
      const leaderCall = byId.get(leaderId);
      const leaderResult = known.get(leaderId);
      if (leaderCall && leaderResult) {
        known.set(duplicateId, reusedResult(byId.get(duplicateId)!, leaderResult));
      }
    }

    const results = calls.map((call) => known.get(call.id)).filter((item): item is ToolMessage => Boolean(item));
    return { results, reusedCount: calls.length - unique.length, executedCount: unique.length };
  }
}
