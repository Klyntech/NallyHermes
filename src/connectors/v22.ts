import { google } from "googleapis";
import { config } from "../config.js";

export type V22Connector = "notion" | "gmail" | "nallputer";
export interface V22OperationDescription { name: string; description: string; readOnly: boolean; inputSchema: Record<string, unknown>; }
type ProviderOperation = V22OperationDescription;

const operation = (name: string, description: string, readOnly: boolean): ProviderOperation => ({
  name,
  description,
  readOnly,
  inputSchema: { type: "object", additionalProperties: true }
});

const catalogs: Record<V22Connector, ProviderOperation[]> = {
  notion: [
    operation("search", "Search pages and databases in the connected Notion workspace.", true),
    operation("get_page", "Read a Notion page and its properties.", true),
    operation("get_block_children", "Read the blocks contained by a Notion page or block.", true),
    operation("query_database", "Query a Notion database.", true),
    operation("create_page", "Create a Notion page; explicit approval required.", false),
    operation("append_blocks", "Append blocks to a Notion page; explicit approval required.", false),
    operation("update_page", "Update Notion page properties; explicit approval required.", false)
  ],
  gmail: [
    operation("search_messages", "Search Gmail messages and threads using a bounded query.", true),
    operation("get_message", "Read a Gmail message with bounded body content.", true),
    operation("get_thread", "Read a Gmail thread with bounded message content.", true),
    operation("list_labels", "List Gmail labels.", true),
    operation("create_draft", "Create a Gmail draft; explicit approval required.", false),
    operation("update_draft", "Update a Gmail draft; explicit approval required.", false),
    operation("send_draft", "Send an existing Gmail draft; explicit approval required.", false),
    operation("modify_message", "Apply labels or archive a Gmail message; explicit approval required.", false)
  ],
  nallputer: [
    operation("health", "Read Nallputer host health and capabilities.", true),
    operation("list_workspace", "List files in the bounded Nallputer workspace.", true),
    operation("read_file", "Read a bounded file from the Nallputer workspace.", true),
    operation("get_processes", "Read bounded process and service status.", true),
    operation("get_logs", "Read bounded service logs.", true),
    operation("run_tests", "Run a configured project test command; approval policy applies.", false),
    operation("run_build", "Run a configured project build command; approval policy applies.", false),
    operation("run_command", "Run a bounded command; explicit approval and command policy required.", false),
    operation("write_file", "Write a file; explicit approval required.", false),
    operation("restart_service", "Restart a service; explicit approval required.", false)
  ]
};

function catalog(provider: V22Connector): ProviderOperation[] {
  return catalogs[provider].map((item) => ({ ...item, inputSchema: structuredClone(item.inputSchema) }));
}

function validateProvider(provider: string): asserts provider is V22Connector {
  if (!Object.hasOwn(catalogs, provider)) throw new Error(`Unknown V2.2 connector: ${provider}`);
}

function hasCredentials(provider: V22Connector): boolean {
  if (provider === "notion") return Boolean(config.NOTION_TOKEN);
  if (provider === "gmail") return Boolean(config.GMAIL_CLIENT_ID && config.GMAIL_CLIENT_SECRET && config.GMAIL_REFRESH_TOKEN);
  return Boolean(config.NALLPUTER_URL && config.NALLPUTER_TOKEN);
}

function writesAllowed(provider: V22Connector): boolean {
  if (provider === "notion") return config.NOTION_ALLOW_WRITES;
  if (provider === "gmail") return config.GMAIL_ALLOW_WRITES;
  return config.NALLPUTER_ALLOW_WRITES;
}

function stringArg(args: Record<string, unknown>, key: string, max = 500): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${key} is required and must be at most ${max} characters.`);
  return value.trim();
}

function optionalString(args: Record<string, unknown>, key: string, max = 500): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  return stringArg(args, key, max);
}

function boundedNumber(args: Record<string, unknown>, key: string, fallback: number, max: number): number {
  const value = args[key] === undefined ? fallback : Number(args[key]);
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${key} must be an integer between 1 and ${max}.`);
  return value;
}

function providerId(args: Record<string, unknown>, key: string): string {
  const value = stringArg(args, key, 100);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(value)) throw new Error(`${key} has an invalid provider identifier.`);
  return value;
}

function objectArg(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} must be an object.`);
  return value as Record<string, unknown>;
}

async function notionRequest(path: string, method: "GET" | "POST" | "PATCH", body?: unknown): Promise<unknown> {
  if (!config.NOTION_TOKEN) throw new Error("notion is not configured. No external action was taken.");
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      Accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(config.NOTION_TIMEOUT_MS)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Notion API returned ${response.status}: ${JSON.stringify(result).slice(0, 500)}`);
  return result;
}

function encodeNotionId(args: Record<string, unknown>, key: string): string {
  return encodeURIComponent(providerId(args, key));
}

async function callNotion(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "search":
      return notionRequest("/search", "POST", { query: optionalString(args, "query", 200), page_size: boundedNumber(args, "page_size", 20, 50), start_cursor: optionalString(args, "start_cursor", 200) });
    case "get_page":
      return notionRequest(`/pages/${encodeNotionId(args, "page_id")}`, "GET");
    case "get_block_children":
      return notionRequest(`/blocks/${encodeNotionId(args, "block_id")}/children?page_size=${boundedNumber(args, "page_size", 50, 100)}`, "GET");
    case "query_database":
      return notionRequest(`/databases/${encodeNotionId(args, "database_id")}/query`, "POST", { filter: args.filter, sorts: args.sorts, page_size: boundedNumber(args, "page_size", 50, 100), start_cursor: optionalString(args, "start_cursor", 200) });
    case "create_page":
      return notionRequest("/pages", "POST", objectArg(args, "page"));
    case "append_blocks":
      return notionRequest(`/blocks/${encodeNotionId(args, "block_id")}/children`, "PATCH", { children: args.children });
    case "update_page":
      return notionRequest(`/pages/${encodeNotionId(args, "page_id")}`, "PATCH", objectArg(args, "properties"));
    default:
      throw new Error(`Unknown notion operation: ${name}`);
  }
}

function gmailClient() {
  if (!config.GMAIL_CLIENT_ID || !config.GMAIL_CLIENT_SECRET || !config.GMAIL_REFRESH_TOKEN) throw new Error("gmail is not configured. No external action was taken.");
  const auth = new google.auth.OAuth2(config.GMAIL_CLIENT_ID, config.GMAIL_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: config.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth });
}

function decodeBase64Url(value: string): string {
  try { return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8").slice(0, 20_000); }
  catch { return ""; }
}

function header(headers: Array<{ name?: string | null; value?: string | null }> | undefined, name: string): string | undefined {
  return headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

function messageBody(payload: { body?: { data?: string | null } | null; parts?: Array<{ mimeType?: string | null; body?: { data?: string | null } | null; parts?: unknown[] | null }> | null } | undefined): string {
  if (!payload) return "";
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  }
  for (const part of payload.parts ?? []) {
    if (part.parts) { const nested = messageBody(part as typeof payload); if (nested) return nested; }
  }
  return "";
}

function normalizeMessage(message: any): Record<string, unknown> {
  const payload = message.payload;
  return {
    id: message.id,
    thread_id: message.threadId,
    label_ids: message.labelIds,
    internal_date: message.internalDate,
    headers: {
      from: header(payload?.headers, "From"),
      to: header(payload?.headers, "To"),
      cc: header(payload?.headers, "Cc"),
      subject: header(payload?.headers, "Subject"),
      date: header(payload?.headers, "Date")
    },
    body: messageBody(payload)
  };
}

function rawEmail(args: Record<string, unknown>): string {
  const to = stringArg(args, "to", 1000);
  const subject = stringArg(args, "subject", 300);
  const body = stringArg(args, "body", 20_000);
  const cc = optionalString(args, "cc", 1000);
  const bcc = optionalString(args, "bcc", 1000);
  return [
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    body
  ].join("\r\n");
}

function encodeRawEmail(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function callGmail(name: string, args: Record<string, unknown>): Promise<unknown> {
  const gmail = gmailClient();
  switch (name) {
    case "search_messages": {
      const response = await gmail.users.messages.list({ userId: "me", q: stringArg(args, "query", 500), maxResults: boundedNumber(args, "max_results", 20, 50), pageToken: optionalString(args, "page_token", 200) });
      return { messages: response.data.messages ?? [], next_page_token: response.data.nextPageToken, result_size_estimate: response.data.resultSizeEstimate };
    }
    case "get_message": {
      const response = await gmail.users.messages.get({ userId: "me", id: providerId(args, "message_id"), format: "full" });
      return normalizeMessage(response.data);
    }
    case "get_thread": {
      const response = await gmail.users.threads.get({ userId: "me", id: providerId(args, "thread_id"), format: "full" });
      return { id: response.data.id, history_id: response.data.historyId, messages: (response.data.messages ?? []).slice(0, 50).map(normalizeMessage) };
    }
    case "list_labels": {
      const response = await gmail.users.labels.list({ userId: "me" });
      return { labels: (response.data.labels ?? []).map((label) => ({ id: label.id, name: label.name, type: label.type })) };
    }
    case "create_draft": {
      const response = await gmail.users.drafts.create({ userId: "me", requestBody: { message: { raw: encodeRawEmail(rawEmail(args)) } } });
      return { id: response.data.id, message: response.data.message ? normalizeMessage(response.data.message) : undefined };
    }
    case "update_draft": {
      const response = await gmail.users.drafts.update({ userId: "me", id: providerId(args, "draft_id"), requestBody: { message: { raw: encodeRawEmail(rawEmail(args)) } } });
      return { id: response.data.id, message: response.data.message ? normalizeMessage(response.data.message) : undefined };
    }
    case "send_draft": {
      const response = await gmail.users.drafts.send({ userId: "me", requestBody: { id: providerId(args, "draft_id") } });
      return normalizeMessage(response.data);
    }
    case "modify_message": {
      const addLabelIds = Array.isArray(args.add_label_ids) ? args.add_label_ids.filter((value): value is string => typeof value === "string").slice(0, 20) : [];
      const removeLabelIds = Array.isArray(args.remove_label_ids) ? args.remove_label_ids.filter((value): value is string => typeof value === "string").slice(0, 20) : [];
      if (args.archive === true && !removeLabelIds.includes("INBOX")) removeLabelIds.push("INBOX");
      if (!addLabelIds.length && !removeLabelIds.length) throw new Error("Provide labels to add/remove or set archive=true.");
      const response = await gmail.users.messages.modify({ userId: "me", id: providerId(args, "message_id"), requestBody: { addLabelIds, removeLabelIds } });
      return { id: response.data.id, thread_id: response.data.threadId, label_ids: response.data.labelIds };
    }
    default:
      throw new Error(`Unknown gmail operation: ${name}`);
  }
}

export function listV22Operations(provider: string): V22OperationDescription[] {
  validateProvider(provider);
  return catalog(provider);
}

export function getV22Operation(provider: string, name: string): V22OperationDescription {
  validateProvider(provider);
  const found = catalogs[provider].find((item) => item.name === name);
  if (!found) throw new Error(`Unknown ${provider} operation: ${name}`);
  return { ...found, inputSchema: structuredClone(found.inputSchema) };
}

export async function callV22Operation(provider: string, name: string, args: Record<string, unknown>, approved = false): Promise<unknown> {
  validateProvider(provider);
  const operation = getV22Operation(provider, name);
  if (!hasCredentials(provider)) throw new Error(`${provider} is not configured. No external action was taken.`);
  if (!operation.readOnly && (!writesAllowed(provider) || !approved)) throw new Error(`${provider} write operations require the provider write gate and explicit approval.`);
  if (provider === "notion") return callNotion(name, args);
  if (provider === "gmail") return callGmail(name, args);
  throw new Error(`${provider} adapter is not implemented yet. No external action was taken.`);
}
