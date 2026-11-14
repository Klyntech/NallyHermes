import { z } from "zod";
import { config } from "../../config.js";
import type { ToolProgressReporter } from "../progress.js";
import {
  creepySearch,
  isCreepyCrawleyConfigured
} from "./creepyCrawley.js";

const searchInput = z.object({
  query: z.string().min(1).max(400),
  max_results: z.number().int().min(1).max(10).default(5),
  /** basic = fast discovery; advanced = deeper research (preferred for numbers, prices, dates). */
  depth: z.enum(["basic", "advanced"]).default("basic"),
  /** When true, prefer advanced depth and extract full page text on top hits. */
  research: z.boolean().default(false),
  topic: z.enum(["general", "news"]).default("general"),
  include_domains: z.array(z.string().min(1).max(200)).max(20).optional(),
  exclude_domains: z.array(z.string().min(1).max(200)).max(20).optional()
});

export type WebSearchInput = z.input<typeof searchInput>;

const PRIMARY_HOST_MARKERS = [
  "anthropic.com",
  "openai.com",
  "ai.google",
  "google.com/cloud",
  "cloud.google.com",
  "aws.amazon.com",
  "docs.aws.amazon.com",
  "azure.microsoft.com",
  "microsoft.com",
  "github.com",
  "gitlab.com",
  "developer.mozilla.org",
  "ietf.org",
  "w3.org",
  "nist.gov",
  "europa.eu",
  "who.int",
  "un.org",
  "arxiv.org",
  "nature.com",
  "science.org",
  "ieee.org",
  "acm.org",
  "nvidia.com",
  "docs.nvidia.com",
  "meta.com",
  "ai.meta.com",
  "x.ai",
  "telegram.org",
  "core.telegram.org",
  "claude.com",
  "platform.claude.com"
];

const AGGREGATOR_HOST_MARKERS = [
  "taskade.com",
  "toloka.ai",
  "medium.com",
  "towardsdatascience.com",
  "blogspot.com",
  "wordpress.com",
  "substack.com",
  "quora.com",
  "pinterest.com",
  "slideshare.net",
  "scribd.com",
  "ranker.com",
  "list.ly",
  "toolify.ai",
  "therundown.ai",
  "futuretools.io",
  "aitools",
  "top10",
  "best-ai"
];

export type SourceTier = "primary" | "secondary" | "aggregator" | "unknown";

/** Classify a result URL for the model so primary docs rank above SEO listicles. */
export function classifySourceTier(url: string): SourceTier {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
  const hay = `${host}${url.toLowerCase()}`;
  if (AGGREGATOR_HOST_MARKERS.some((m) => hay.includes(m))) return "aggregator";
  if (PRIMARY_HOST_MARKERS.some((m) => host === m || host.endsWith(`.${m}`) || hay.includes(m))) {
    return "primary";
  }
  if (host.startsWith("docs.") || host.startsWith("api.") || host.startsWith("developer.")) {
    return "primary";
  }
  if (host.includes("blog") || host.includes("news") || host.endsWith(".medium.com")) {
    return "secondary";
  }
  return "unknown";
}

/**
 * Lightweight query planner: turn one user-facing query into a few focused
 * search strings that bias toward primary sources and the measurable ask.
 */
export function planSearchQueries(query: string, research: boolean): string[] {
  const q = query.trim();
  if (!research) return [q];

  const variants = new Set<string>([q]);
  const lower = q.toLowerCase();

  if (/\b(price|pricing|cost|token|model|api|launch|release|changelog)\b/i.test(q)) {
    variants.add(`${q} official documentation`);
    variants.add(`${q} site:docs OR changelog OR "pricing"`);
  }
  if (/\b(github|commit|branch|repo|repository)\b/i.test(q)) {
    variants.add(`${q} site:github.com`);
  }
  if (/\banthropic\b|\bclaude\b/i.test(lower)) {
    variants.add(`${q} site:anthropic.com OR site:platform.claude.com`);
  }
  if (/\b(aws|amazon)\b/i.test(lower)) {
    variants.add(`${q} site:aws.amazon.com OR site:docs.aws.amazon.com`);
  }
  if (/\b(azure|microsoft)\b/i.test(lower)) {
    variants.add(`${q} site:azure.microsoft.com`);
  }
  if (/\b(google cloud|gcp|vertex)\b/i.test(lower)) {
    variants.add(`${q} site:cloud.google.com`);
  }

  return [...variants].slice(0, 3);
}

type NormalizedHit = {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date: string | null;
  publication_age_days: number | null;
  freshness: string;
  source_tier: SourceTier;
  extracted_content?: string;
  extraction_status?: string;
  relevance_status?: string;
  raw_content?: string;
};

function freshnessFields(published_date: string | null | undefined, retrievedAt: Date) {
  const publishedAt = published_date ? new Date(published_date) : null;
  const valid = publishedAt && Number.isFinite(publishedAt.getTime());
  const publicationAgeDays = valid
    ? Math.floor((retrievedAt.getTime() - publishedAt!.getTime()) / 86_400_000)
    : null;
  const freshness =
    publicationAgeDays === null
      ? "undated"
      : publicationAgeDays < 0
        ? "future_dated_check_source"
        : publicationAgeDays <= 30
          ? "published_within_30_days"
          : "older_than_30_days";
  return {
    published_date: published_date ?? null,
    publication_age_days: publicationAgeDays,
    freshness
  };
}

function mapHit(
  hit: {
    title?: string;
    url?: string;
    content?: string;
    score?: number | null;
    published_date?: string | null;
    extracted_content?: string | null;
    extraction_status?: string;
    relevance_status?: string;
    raw_content?: string | null;
  },
  retrievedAt: Date
): NormalizedHit | null {
  if (!hit.url) return null;
  const fresh = freshnessFields(hit.published_date, retrievedAt);
  const extracted = hit.extracted_content ? String(hit.extracted_content).slice(0, 12_000) : undefined;
  return {
    title: hit.title ?? hit.url,
    url: hit.url,
    content: hit.content ?? "",
    score: typeof hit.score === "number" ? hit.score : 0,
    ...fresh,
    source_tier: classifySourceTier(hit.url),
    extracted_content: extracted,
    extraction_status: hit.extraction_status,
    relevance_status: hit.relevance_status,
    raw_content: extracted ?? (hit.raw_content ? String(hit.raw_content).slice(0, 12_000) : undefined)
  };
}

async function tavilySearch(
  query: string,
  max_results: number,
  depth: "basic" | "advanced",
  includeRaw: boolean
): Promise<{ answer?: string; results?: Array<Record<string, unknown>> }> {
  if (!config.TAVILY_API_KEY) {
    throw new Error("Tavily is not configured (fallback). Add TAVILY_API_KEY or configure Creepy Crawley.");
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: config.TAVILY_API_KEY,
      query,
      max_results,
      search_depth: depth,
      include_answer: true,
      include_raw_content: includeRaw
    }),
    signal: AbortSignal.timeout(depth === "advanced" ? 35_000 : 20_000)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Tavily search failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  return (await response.json()) as { answer?: string; results?: Array<Record<string, unknown>> };
}

function sortResults(results: NormalizedHit[]): NormalizedHit[] {
  const tierRank: Record<SourceTier, number> = {
    primary: 0,
    secondary: 1,
    unknown: 2,
    aggregator: 3
  };
  return [...results].sort((a, b) => {
    const tr = tierRank[a.source_tier] - tierRank[b.source_tier];
    if (tr !== 0) return tr;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}

/** Search the web: hybrid CC + Tavily when both are configured (closes coverage gap). */
export async function searchWeb(input: WebSearchInput, onProgress?: ToolProgressReporter): Promise<unknown> {
  const parsed = searchInput.parse(input);
  const research = parsed.research;
  const depth = research ? "advanced" : parsed.depth;
  const extract = research || depth === "advanced";
  const queries = planSearchQueries(parsed.query, research);
  const perQuery = Math.max(3, Math.ceil(parsed.max_results / queries.length));
  const mode = config.WEB_SEARCH_MODE;
  const useCc = isCreepyCrawleyConfigured() && mode !== "tavily";
  const useTavily = Boolean(config.TAVILY_API_KEY) && mode !== "creepy_crawley";

  await onProgress?.({
    type: "tool_progress",
    tool: "web_search",
    stage: "search_start",
    queryCount: queries.length,
    depth
  });

  if (!useCc && !useTavily) {
    throw new Error(
      "Web search is not configured. Set CREEPY_CRAWLEY_API_KEY and/or TAVILY_API_KEY (WEB_SEARCH_MODE=" +
        mode +
        ")."
    );
  }

  const retrievedAt = new Date();
  const merged = new Map<string, NormalizedHit>();
  let answer: string | null = null;
  const providersUsed: string[] = [];
  const errors: string[] = [];

  const mergeHit = (mapped: NormalizedHit) => {
    const existing = merged.get(mapped.url);
    if (!existing) {
      merged.set(mapped.url, mapped);
      return;
    }
    // Prefer the hit with extracted/raw body; then higher score; keep best tier via later sort
    const existingBody = (existing.extracted_content || existing.raw_content || "").length;
    const nextBody = (mapped.extracted_content || mapped.raw_content || "").length;
    if (nextBody > existingBody || (nextBody === existingBody && (mapped.score ?? 0) > (existing.score ?? 0))) {
      merged.set(mapped.url, {
        ...existing,
        ...mapped,
        // Keep the stronger body fields
        content: mapped.content || existing.content,
        extracted_content: mapped.extracted_content || existing.extracted_content,
        raw_content: mapped.raw_content || existing.raw_content,
        extraction_status: mapped.extraction_status || existing.extraction_status,
        score: Math.max(existing.score ?? 0, mapped.score ?? 0)
      });
    }
  };

  // 1) Creepy Crawley — depth + extract on official pages
  if (useCc) {
    try {
      for (const q of queries) {
        const data = await creepySearch({
          query: q,
          max_results: perQuery,
          topic: parsed.topic,
          extract_content: extract,
          max_content_results: extract ? Math.min(5, perQuery) : 0,
          include_domains: parsed.include_domains,
          exclude_domains: parsed.exclude_domains
        });
        if (!answer && data.answer) answer = data.answer;
        for (const hit of data.results) {
          const mapped = mapHit(hit, retrievedAt);
          if (mapped) mergeHit(mapped);
        }
      }
      providersUsed.push("creepy_crawley");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`creepy_crawley: ${msg}`);
      console.warn("Creepy Crawley search failed:", error);
    }
  }

  // 2) Tavily — broader coverage (always in hybrid when key present, or sole backend)
  // In hybrid, also run when CC returned thin results OR always merge for coverage.
  const thin = merged.size < Math.min(3, parsed.max_results);
  const shouldTavily = useTavily && (mode === "tavily" || mode === "hybrid" || thin || !providersUsed.includes("creepy_crawley"));

  if (shouldTavily) {
    try {
      // Slightly wider net from Tavily to close coverage gap
      const tavilyPerQuery = mode === "hybrid" ? Math.max(perQuery, Math.min(8, parsed.max_results + 2)) : perQuery;
      for (const q of queries) {
        const data = await tavilySearch(q, tavilyPerQuery, depth, extract && !useCc);
        if (!answer && data.answer) answer = data.answer;
        for (const hit of data.results ?? []) {
          const mapped = mapHit(
            {
              title: String(hit.title ?? ""),
              url: String(hit.url ?? ""),
              content: String(hit.content ?? ""),
              score: typeof hit.score === "number" ? hit.score : 0,
              published_date: (hit.published_date as string | null) ?? null,
              raw_content: (hit.raw_content as string | null) ?? null
            },
            retrievedAt
          );
          if (mapped) mergeHit(mapped);
        }
      }
      providersUsed.push("tavily");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`tavily: ${msg}`);
      console.warn("Tavily search failed:", error);
    }
  }

  if (merged.size === 0) {
    throw new Error(
      errors.length
        ? `Web search failed. ${errors.join(" | ")}`
        : "Web search returned no results."
    );
  }

  const results = sortResults([...merged.values()]).slice(0, parsed.max_results);
  const primaryCount = results.filter((r) => r.source_tier === "primary").length;
  const provider =
    providersUsed.length > 1 ? "hybrid" : providersUsed[0] === "tavily" ? "tavily" : "creepy_crawley";

  await onProgress?.({
    type: "tool_progress",
    tool: "web_search",
    stage: "search_complete",
    resultCount: results.length
  });

  return {
    answer,
    provider,
    providers_used: providersUsed,
    provider_errors: errors.length ? errors : undefined,
    searched_at: retrievedAt.toISOString(),
    depth_used: depth,
    queries_used: queries,
    primary_result_count: primaryCount,
    freshness_guidance:
      "searched_at is retrieval time, not publication time. Publication dates may be absent. The 30-day age label is only a rough heuristic, not proof of currentness; fast-changing topics can become outdated much sooner.",
    verification_guidance:
      "Prefer source_tier=primary. For prices, counts, dates, or complete inventories, call fetch on at least one primary URL before stating numbers when extracted_content is missing or thin. Do not fill table cells from snippets alone. If a field is missing on the primary page, write Not verified — not 'not disclosed' from memory.",
    results
  };
}
