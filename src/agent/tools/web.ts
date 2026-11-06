import { z } from "zod";
import { config } from "../../config.js";

const searchInput = z.object({
  query: z.string().min(1).max(400),
  max_results: z.number().int().min(1).max(10).default(5)
});

export type WebSearchInput = z.input<typeof searchInput>;

/** Search the web with Tavily and return concise, source-linked results. */
export async function searchWeb(input: WebSearchInput): Promise<unknown> {
  const { query, max_results } = searchInput.parse(input);
  if (!config.TAVILY_API_KEY) {
    throw new Error("Web search is not configured. Add TAVILY_API_KEY to the environment.");
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.TAVILY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
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
    results?: Array<{ title: string; url: string; content: string; score: number }>;
  };

  return {
    answer: data.answer ?? null,
    results: (data.results ?? []).map(({ title, url, content, score }) => ({
      title, url, content, score
    }))
  };
}
