import { z } from "zod";
import { config } from "../../config.js";
import type { ToolProgressReporter } from "../progress.js";

const searchInput = z.object({
  query: z.string().min(1).max(400),
  max_results: z.number().int().min(1).max(10).default(5)
});

export type WebSearchInput = z.input<typeof searchInput>;

/** Search the web with Tavily and return concise, source-linked results. */
export async function searchWeb(input: WebSearchInput, onProgress?: ToolProgressReporter): Promise<unknown> {
  const { query, max_results } = searchInput.parse(input);
  if (!config.TAVILY_API_KEY) {
    throw new Error("Web search is not configured. Add TAVILY_API_KEY to the environment.");
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      api_key: config.TAVILY_API_KEY,
      query,
      max_results,
      search_depth: "basic",
      include_answer: true,
      include_raw_content: false
    }),
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Tavily search failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json() as {
    answer?: string;
    results?: Array<{ title: string; url: string; content: string; score: number; published_date?: string | null }>;
  };

  const retrievedAt = new Date();
  await onProgress?.({ type: "tool_progress", tool: "web_search", stage: "search_complete", resultCount: data.results?.length ?? 0 });

  return {
    answer: data.answer ?? null,
    searched_at: retrievedAt.toISOString(),
    freshness_guidance: "searched_at is retrieval time, not publication time. Publication dates may be absent. The 30-day age label is only a rough heuristic, not proof of currentness; fast-changing topics can become outdated much sooner.",
    results: (data.results ?? []).map(({ title, url, content, score, published_date }) => {
      const publishedAt = published_date ? new Date(published_date) : null;
      const validPublicationDate = publishedAt && Number.isFinite(publishedAt.getTime());
      const publicationAgeDays = validPublicationDate
        ? Math.floor((retrievedAt.getTime() - publishedAt.getTime()) / 86_400_000)
        : null;
      const freshness = publicationAgeDays === null
        ? "undated"
        : publicationAgeDays < 0
          ? "future_dated_check_source"
          : publicationAgeDays <= 30
            ? "published_within_30_days"
            : "older_than_30_days";
      return {
        title, url, content, score,
        published_date: published_date ?? null,
        publication_age_days: publicationAgeDays,
        freshness
      };
    })
  };
}
