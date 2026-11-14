import { config } from "../../config.js";

export type CreepySearchHit = {
  title: string;
  url: string;
  content: string;
  extracted_content?: string | null;
  extraction_status?: string;
  score?: number | null;
  published_date?: string | null;
  relevance_status?: string;
  quality_flags?: string[];
  rank?: number | null;
};

export type CreepySearchResponse = {
  query?: string;
  answer?: string | null;
  context?: string | null;
  results: CreepySearchHit[];
  response_time?: number;
  provider: "creepy_crawley";
};

export type CreepyScrapeResponse = {
  url: string;
  title?: string | null;
  content: string;
  content_truncated?: boolean;
  structured?: Record<string, unknown>;
  provider: "creepy_crawley";
  fetched_at: string;
};

function baseUrl(): string {
  const url = config.CREEPY_CRAWLEY_URL?.replace(/\/$/, "");
  if (!url) throw new Error("CREEPY_CRAWLEY_URL is not configured.");
  return url;
}

function apiKey(): string {
  const key = config.CREEPY_CRAWLEY_API_KEY?.trim();
  if (!key) throw new Error("CREEPY_CRAWLEY_API_KEY is not configured.");
  return key;
}

export function isCreepyCrawleyConfigured(): boolean {
  return Boolean(config.CREEPY_CRAWLEY_URL?.trim() && config.CREEPY_CRAWLEY_API_KEY?.trim());
}

async function ccFetch(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.CREEPY_CRAWLEY_TIMEOUT_MS)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Creepy Crawley ${path} failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return response.json();
}

export async function creepySearch(input: {
  query: string;
  max_results?: number;
  topic?: "general" | "news";
  extract_content?: boolean;
  max_content_results?: number;
  include_domains?: string[];
  exclude_domains?: string[];
}): Promise<CreepySearchResponse> {
  const data = (await ccFetch("/v1/search", {
    query: input.query,
    max_results: input.max_results ?? 5,
    topic: input.topic ?? "general",
    extract_content: input.extract_content ?? true,
    max_content_results: input.max_content_results ?? 5,
    include_domains: input.include_domains ?? [],
    exclude_domains: input.exclude_domains ?? []
  })) as {
    query?: string;
    answer?: string | null;
    context?: string | null;
    results?: CreepySearchHit[];
    response_time?: number;
  };

  return {
    query: data.query,
    answer: data.answer ?? null,
    context: data.context ?? null,
    results: data.results ?? [],
    response_time: data.response_time,
    provider: "creepy_crawley"
  };
}

export async function creepyScrape(url: string): Promise<CreepyScrapeResponse> {
  const data = (await ccFetch("/v1/scrape", { url })) as {
    url?: string;
    title?: string | null;
    content?: string;
    content_truncated?: boolean;
    structured?: Record<string, unknown>;
  };
  return {
    url: data.url ?? url,
    title: data.title ?? null,
    content: data.content ?? "",
    content_truncated: data.content_truncated,
    structured: data.structured,
    provider: "creepy_crawley",
    fetched_at: new Date().toISOString()
  };
}
