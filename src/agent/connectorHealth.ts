import { config } from "../config.js";
import { isCreepyCrawleyConfigured } from "./tools/creepyCrawley.js";

export type ConnectorHealth = {
  id: string;
  available: boolean;
  /** read | write capability when available */
  capabilities?: Array<"read" | "write">;
  detail?: string;
};

/**
 * Real connector health from runtime config (and provider gates).
 * Synchronous and cheap — no live network probes on the hot path.
 * Live probes belong in dedicated health endpoints, not every agent turn.
 */
export function buildConnectorHealth(): ConnectorHealth[] {
  const webTavily = Boolean(config.TAVILY_API_KEY?.trim());
  const webCreepy = isCreepyCrawleyConfigured();
  const webMode = config.WEB_SEARCH_MODE;
  const webAvailable =
    webMode === "tavily" ? webTavily :
    webMode === "creepy_crawley" ? webCreepy :
    webTavily || webCreepy;

  const webDetail = (() => {
    if (webAvailable) {
      const parts: string[] = [];
      if (webCreepy) parts.push("creepy_crawley");
      if (webTavily) parts.push("tavily");
      return `mode=${webMode}; backends=${parts.join("+") || "none"}`;
    }
    if (webMode === "tavily") return "TAVILY_API_KEY missing";
    if (webMode === "creepy_crawley") return "CREEPY_CRAWLEY not configured";
    return "No web search backend configured (Tavily or Creepy Crawley)";
  })();

  const github = Boolean(config.GITHUB_TOKEN?.trim());
  const notion = Boolean(config.NOTION_TOKEN?.trim());
  const gmail = Boolean(
    config.GMAIL_CLIENT_ID?.trim() &&
    config.GMAIL_CLIENT_SECRET?.trim() &&
    config.GMAIL_REFRESH_TOKEN?.trim()
  );
  const calendar = Boolean(
    config.GOOGLE_CALENDAR_ENABLED &&
    config.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
    config.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() &&
    config.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim()
  );
  const voice = Boolean(
    config.VOICE_ENABLED &&
    config.DEEPGRAM_API_KEY?.trim() &&
    config.ELEVENLABS_API_KEY?.trim() &&
    config.ELEVENLABS_VOICE_ID?.trim()
  );
  const nallputer = Boolean(config.NALLPUTER_URL && config.NALLPUTER_TOKEN?.trim());

  const caps = (read: boolean, write: boolean): Array<"read" | "write"> | undefined => {
    if (!read) return undefined;
    return write ? ["read", "write"] : ["read"];
  };

  return [
    {
      id: "web_search",
      available: webAvailable,
      capabilities: webAvailable ? ["read"] : undefined,
      detail: webDetail
    },
    {
      id: "github",
      available: github,
      capabilities: caps(github, config.GITHUB_ALLOW_WRITES),
      detail: github ? (config.GITHUB_ALLOW_WRITES ? "writes_enabled" : "read_only") : "GITHUB_TOKEN missing"
    },
    {
      id: "notion",
      available: notion,
      capabilities: caps(notion, config.NOTION_ALLOW_WRITES),
      detail: notion ? (config.NOTION_ALLOW_WRITES ? "writes_enabled" : "read_only") : "NOTION_TOKEN missing"
    },
    {
      id: "gmail",
      available: gmail,
      capabilities: caps(gmail, config.GMAIL_ALLOW_WRITES),
      detail: gmail ? (config.GMAIL_ALLOW_WRITES ? "writes_enabled" : "read_only") : "Gmail OAuth not configured"
    },
    {
      id: "calendar",
      available: calendar,
      capabilities: caps(calendar, true),
      detail: calendar ? "google_calendar" : "Google Calendar not enabled or OAuth incomplete"
    },
    {
      id: "voice",
      available: voice,
      capabilities: voice ? ["read", "write"] : undefined,
      detail: voice ? "deepgram+elevenlabs" : "Voice disabled or STT/TTS keys missing"
    },
    {
      id: "nallputer",
      available: nallputer,
      capabilities: caps(nallputer, config.NALLPUTER_ALLOW_WRITES),
      detail: nallputer
        ? (config.NALLPUTER_ALLOW_WRITES ? "writes_enabled" : "read_only")
        : "NALLPUTER_URL/TOKEN missing"
    }
  ];
}
