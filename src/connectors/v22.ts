import { config } from "../config.js";

export type V22Connector = "notion" | "gmail" | "nallputer";
export interface V22OperationDescription { name: string; description: string; readOnly: boolean; inputSchema: Record<string, unknown>; }

const operation = (name: string, description: string, readOnly: boolean): V22OperationDescription => ({
  name,
  description,
  readOnly,
  inputSchema: { type: "object", additionalProperties: true }
});

const catalogs: Record<V22Connector, V22OperationDescription[]> = {
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

function catalog(provider: V22Connector): V22OperationDescription[] {
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

export async function callV22Operation(provider: string, name: string, _args: Record<string, unknown>, approved = false): Promise<unknown> {
  validateProvider(provider);
  const operation = getV22Operation(provider, name);
  if (!hasCredentials(provider)) throw new Error(`${provider} is not configured. No external action was taken.`);
  if (!operation.readOnly && (!writesAllowed(provider) || !approved)) {
    throw new Error(`${provider} write operations require the provider write gate and explicit approval.`);
  }
  throw new Error(`${provider} operation '${name}' is contract-only in V2.2 alpha. The provider adapter has not executed any external action.`);
}
