import { z } from "zod";
import { config } from "../../config.js";
import type { ToolProgressReporter } from "../progress.js";

const searchInput = z.object({
  query: z.string().min(1).max(400),
  max_results: z.number().int().min(1).max(10).default(5),
  /** basic = fast discovery; advanced = deeper research (preferred for numbers, prices, dates). */
  depth: z.enum(["basic", "advanced"]).default("basic"),
  /** When true, prefer advanced depth and include raw content on top hits for verification. */
  research: z.boolean().default(false)
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
  "core.telegram.org"
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
  "there's an ai for that",
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
  // docs.* and official API hosts are usually primary
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

  // Bias official docs when the topic looks product/pricing related
  if (/\b(price|pricing|cost|token|model|api|launch|release|changelog)\b/i.test(q)) {
    variants.add(`${q} official documentation`);
    variants.add(`${q} site:docs OR changelog OR "pricing"`);
  }
  if (/\b(github|commit|branch|repo|repository)\b/i.test(q)) {
    variants.add(`${q} site:github.com`);
  }
  if (/\banthropic\b/i.test(lower)) {
    variants.add(`${q} site:anthropic.com`);
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

type TavilyHit = {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string | null;
  raw_content?: string | null;
};

function mapHit(hit: TavilyHit, retrievedAt: Date) {
  const publishedAt = hit.published_date ? new Date(hit.published_date) : null;
  const validPublicationDate = publishedAt && Number.isFinite(publishedAt.getTime());
  const publicationAgeDays = validPublicationDate
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
  const source_tier = classifySourceTier(hit.url);
  return {
    title: hit.title,
    url: hit.url,
    content: hit.content,
    score: hit.score,
    published_date: hit.published_date ?? null,
    publication_age_days: publicationAgeDays,
    freshness,
    source_tier,
    raw_content: hit.raw_content ? String(hit.raw_content).slice(0, 12_000) : undefined
  };
}

async function tavilySearch(
  query: string,
  max_results: number,
  depth: "basic" | "advanced",
  includeRaw: boolean
): Promise<{ answer?: string; results?: TavilyHit[] }> {
  if (!config.TAVILY_API_KEY) {
    throw new Error("Web search is not configured. Add TAVILY_API_KEY to the environment.");
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

  return (await response.json()) as { answer?: string; results?: TavilyHit[] };
}

/** Search the web with Tavily and return concise, source-tiered, source-linked results. */
export async function searchWeb(input: WebSearchInput, onProgress?: ToolProgressReporter): Promise<unknown> {
  const parsed = searchInput.parse(input);
  const research = parsed.research;
  const depth = research ? "advanced" : parsed.depth;
  const includeRaw = research || depth === "advanced";
  const queries = planSearchQueries(parsed.query, research);
  const perQuery = Math.max(3, Math.ceil(parsed.max_results / queries.length));

  await onProgress?.({
    type: "tool_progress",
    tool: "web_search",
    stage: "search_start",
    queryCount: queries.length,
    depth
  });

  const retrievedAt = new Date();
  const merged = new Map<string, ReturnType<typeof mapHit>>();
  let answer: string | null = null;

  for (const q of queries) {
    const data = await tavilySearch(q, perQuery, depth, includeRaw);
    if (!answer && data.answer) answer = data.answer;
    for (const hit of data.results ?? []) {
      if (!hit?.url) continue;
      const mapped = mapHit(hit, retrievedAt);
      const existing = merged.get(mapped.url);
      if (!existing || (mapped.score ?? 0) > (existing.score ?? 0)) {
        merged.set(mapped.url, mapped);
      }
    }
  }

  // Prefer primary sources in the returned order
  const tierRank: Record<SourceTier, number> = {
    primary: 0,
    secondary: 1,
    unknown: 2,
    aggregator: 3
  };
  const results = [...merged.values()]
    .sort((a, b) => {
      const tr = tierRank[a.source_tier] - tierRank[b.source_tier];
      if (tr !== 0) return tr;
      return (b.score ?? 0) - (a.score ?? 0);
    })
    .slice(0, parsed.max_results);

  await onProgress?.({
    type: "tool_progress",
    tool: "web_search",
    stage: "search_complete",
    resultCount: results.length
  });

  const primaryCount = results.filter((r) => r.source_tier === "primary").length;

  return {
    answer,
    searched_at: retrievedAt.toISOString(),
    depth_used: depth,
    queries_used: queries,
    primary_result_count: primaryCount,
    freshness_guidance:
      "searched_at is retrieval time, not publication time. Publication dates may be absent. The 30-day age label is only a rough heuristic, not proof of currentness; fast-changing topics can become outdated much sooner.",
    verification_guidance:
      "Prefer source_tier=primary. For prices, counts, dates, or complete inventories, call fetch on at least one primary URL before stating numbers. Do not fill table cells from snippets alone. If a field is missing on the primary page, write Not verified — not 'not disclosed' from memory.",
    results
  };
}
