import { z } from "zod";
import { toolRegistry } from "./registry.js";

const schema = z.object({ url: z.string().url(), max_chars: z.number().int().min(500).max(20000).default(10000) });
function assertPublicHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS URLs are allowed.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host === "0.0.0.0" || host === "::1" || /^127\./.test(host) ||
      /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "metadata.google.internal") {
    throw new Error("Requests to local or private network addresses are blocked.");
  }
  return url;
}
toolRegistry.register({
  name: "fetch",
  description: "Fetch and extract readable text from a public HTTP or HTTPS webpage.",
  schema,
  parameters: { type: "object", properties: { url: { type: "string", format: "uri" }, max_chars: { type: "integer", minimum: 500, maximum: 20000, default: 10000 } }, required: ["url"], additionalProperties: false },
  async execute({ url, max_chars }) {
    const target = assertPublicHttpUrl(url);
    const response = await fetch(target, { redirect: "manual", headers: { "User-Agent": "NallyHermes/0.1 (+web fetch)", "Accept": "text/html,text/plain,application/xhtml+xml" }, signal: AbortSignal.timeout(15_000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Website returned a redirect without a destination.");
      const next = new URL(location, target);
      assertPublicHttpUrl(next.toString());
      const redirected = await fetch(next, { redirect: "manual", headers: { "User-Agent": "NallyHermes/0.1 (+web fetch)" }, signal: AbortSignal.timeout(15_000) });
      if (!redirected.ok) throw new Error(`Website returned HTTP ${redirected.status}`);
      return extract(redirected, max_chars, next.toString());
    }
    if (!response.ok) throw new Error(`Website returned HTTP ${response.status}`);
    return extract(response, max_chars, target.toString());
  }
});
async function extract(response: Response, max: number, url: string) {
  const type = response.headers.get("content-type") ?? "";
  if (!/(text\/|application\/(xhtml\+xml|json))/.test(type)) throw new Error("This URL did not return a supported text content type.");
  const raw = (await response.text()).slice(0, 1_000_000);
  const text = type.includes("html") ? raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim() : raw;
  return { url, contentType: type, content: text.slice(0, max), truncated: text.length > max };
}
