import { z } from "zod";
import { config } from "../../config.js";
import { toolRegistry } from "./registry.js";

const searchSchema = z.object({ query: z.string().min(2).max(300), count: z.number().int().min(1).max(10).default(5) });
toolRegistry.register({
  name: "web_search",
  description: "Search the public web for current information. Requires BRAVE_SEARCH_API_KEY.",
  schema: searchSchema,
  parameters: { type: "object", properties: { query: { type: "string", description: "Search query" }, count: { type: "integer", minimum: 1, maximum: 10, default: 5 } }, required: ["query"], additionalProperties: false },
  async execute({ query, count }) {
    if (!config.BRAVE_SEARCH_API_KEY) throw new Error("Web search is not configured. Add BRAVE_SEARCH_API_KEY.");
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`, {
      headers: { "Accept": "application/json", "X-Subscription-Token": config.BRAVE_SEARCH_API_KEY },
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}`);
    const body = await response.json() as { web?: { results?: { title: string; url: string; description?: string }[] } };
    return (body.web?.results ?? []).map(({ title, url, description }) => ({ title, url, description }));
  }
});
