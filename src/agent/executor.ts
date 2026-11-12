import { z } from "zod";
import { config } from "../config.js";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { searchWeb } from "./tools/web.js";
import { fetchUrl, fileIO, memoryTool, scheduleTool, workflowTool } from "./tools/extended.js";
import { calendarTool } from "./calendar.js";
import type { ProgressEvent, ToolProgressReporter } from "./progress.js";
import { classifyFailure } from "./failure.js";
import { callGitHubOperation, getGitHubOperation, listGitHubOperations } from "../connectors/github.js";
import { callV22Operation, getV22Operation, listV22Operations, type V22Connector } from "../connectors/v22.js";

export interface ToolCallInput {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

const schemas = {
  web_search: z.object({
    query: z.string().trim().min(1).max(400),
    max_results: z.number().int().min(1).max(10).optional()
  }).strict(),
  fetch: z.object({ url: z.string().url().max(2048) }).strict(),
  file_io: z.object({
    operation: z.enum(["read", "write", "edit", "grep", "delete", "list", "mkdir"]),
    path: z.string().trim().min(1).max(500),
    content: z.string().max(1_000_000).optional(),
    search: z.string().max(1_000_000).optional(),
    replace: z.string().max(1_000_000).optional()
  }).strict(),
  memory: z.object({
    operation: z.enum(["recall", "remember", "forget", "update"]),
    content: z.string().max(4000).optional(),
    id: z.string().max(100).optional(),
    query: z.string().max(1000).optional(),
    kind: z.enum(["fact", "preference", "project", "commitment", "entity", "episode"]).optional(),
    subject: z.string().max(200).optional(),
    predicate: z.string().max(200).optional(),
    object: z.string().max(500).optional(),
    confidence: z.number().int().min(0).max(100).optional(),
    expires_at: z.string().max(64).optional()
  }).strict(),
  schedule: z.object({
    operation: z.enum(["create", "list", "cancel"]),
    task: z.string().max(1000).optional(),
    run_at: z.string().max(64).optional(),
    recurrence: z.enum(["daily", "weekly", "monthly"]).optional(),
    timezone: z.string().max(100).optional(),
    id: z.string().max(100).optional()
  }).strict(),
  workflow: z.object({
    operation: z.enum(["create", "list", "pause", "cancel"]),
    name: z.string().trim().min(1).max(120).optional(),
    instructions: z.string().trim().min(1).max(4000).optional(),
    run_at: z.string().max(64).optional(),
    recurrence: z.enum(["daily", "weekly", "monthly"]).optional(),
    timezone: z.string().max(100).optional(),
    allowed_tools: z.array(z.enum(["web_search", "fetch", "memory", "file_io", "schedule", "calendar", "github", "notion", "gmail", "nallputer"])).max(10).optional(),
    approval_policy: z.string().trim().min(1).max(100).optional(),
    output_destination: z.literal("telegram").optional(),
    id: z.string().max(100).optional()
  }).strict(),
  calendar: z.object({
    operation: z.enum(["list", "create", "update", "cancel"]),
    from: z.string().max(64).optional(),
    to: z.string().max(64).optional(),
    title: z.string().max(300).optional(),
    start: z.string().max(64).optional(),
    end: z.string().max(64).optional(),
    timezone: z.string().max(100).optional(),
    description: z.string().max(4000).optional(),
    location: z.string().max(500).optional(),
    attendees: z.array(z.string().max(320)).max(50).optional(),
    calendar_id: z.string().max(200).optional(),
    event_id: z.string().max(200).optional()
  }).strict(),
  github: z.object({
    operation: z.enum(["list_operations", "get_operation", "call_operation"]),
    name: z.string().trim().max(100).optional(),
    arguments: z.record(z.string(), z.unknown()).optional(),
    approved: z.boolean().optional()
  }).strict(),
  notion: z.object({ operation: z.enum(["list_operations", "get_operation", "call_operation"]), name: z.string().trim().max(100).optional(), arguments: z.record(z.string(), z.unknown()).optional(), approved: z.boolean().optional() }).strict(),
  gmail: z.object({ operation: z.enum(["list_operations", "get_operation", "call_operation"]), name: z.string().trim().max(100).optional(), arguments: z.record(z.string(), z.unknown()).optional(), approved: z.boolean().optional() }).strict(),
  nallputer: z.object({ operation: z.enum(["list_operations", "get_operation", "call_operation"]), name: z.string().trim().max(100).optional(), arguments: z.record(z.string(), z.unknown()).optional(), approved: z.boolean().optional() }).strict()
};

type ToolName = keyof typeof schemas;

function parseToolArguments(name: string, raw: string): Record<string, unknown> {
  const schema = schemas[name as ToolName];
  if (!schema) throw new Error("Unknown tool: " + name);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Tool arguments must be valid JSON.");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error("Invalid " + name + " arguments: " + (issue?.message ?? "schema validation failed") + ".");
  }
  return parsed.data as Record<string, unknown>;
}

async function executeToolCallOnce(
  call: ToolCallInput,
  telegramId: string,
  onProgress?: (event: ProgressEvent) => Promise<void> | void
): Promise<Extract<ChatCompletionMessageParam, { role: "tool" }>> {
  try {
    const args = parseToolArguments(call.function.name, call.function.arguments);
    await onProgress?.({ type: "tool_start", tool: call.function.name, args });
    const reportToolProgress: ToolProgressReporter = (event) => onProgress?.(event);
    let result: unknown;

    switch (call.function.name) {
      case "web_search":
        result = await searchWeb(args as { query: string; max_results?: number }, reportToolProgress);
        break;
      case "fetch":
        result = await fetchUrl(args as { url: string }, reportToolProgress);
        break;
      case "file_io":
        result = await fileIO(telegramId, args as Parameters<typeof fileIO>[1], reportToolProgress);
        break;
      case "memory":
        result = await memoryTool(telegramId, args as Parameters<typeof memoryTool>[1], reportToolProgress);
        break;
      case "schedule":
        result = await scheduleTool(telegramId, args as Parameters<typeof scheduleTool>[1], reportToolProgress);
        break;
      case "workflow":
        result = await workflowTool(telegramId, args as Parameters<typeof workflowTool>[1]);
        break;
      case "calendar":
        result = await calendarTool(telegramId, args as unknown as Parameters<typeof calendarTool>[1]);
        break;
      case "github": {
        const githubArgs = args as { operation: "list_operations" | "get_operation" | "call_operation"; name?: string; arguments?: Record<string, unknown>; approved?: boolean };
        if (githubArgs.operation === "list_operations") result = listGitHubOperations();
        else if (!githubArgs.name) throw new Error("GitHub operation name is required.");
        else if (githubArgs.operation === "get_operation") result = getGitHubOperation(githubArgs.name);
        else result = await callGitHubOperation(githubArgs.name, githubArgs.arguments ?? {}, githubArgs.approved === true);
        break;
      }
      case "notion":
      case "gmail":
      case "nallputer": {
        const provider = call.function.name as V22Connector;
        const connectorArgs = args as { operation: "list_operations" | "get_operation" | "call_operation"; name?: string; arguments?: Record<string, unknown>; approved?: boolean };
        if (connectorArgs.operation === "list_operations") result = listV22Operations(provider);
        else if (!connectorArgs.name) throw new Error(`${provider} operation name is required.`);
        else if (connectorArgs.operation === "get_operation") result = getV22Operation(provider, connectorArgs.name);
        else result = await callV22Operation(provider, connectorArgs.name, connectorArgs.arguments ?? {}, connectorArgs.approved === true);
        break;
      }
      default:
        throw new Error("Unknown tool.");
    }

    await onProgress?.({ type: "tool_complete", tool: call.function.name });
    return { role: "tool", tool_call_id: call.id, content: JSON.stringify(result) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Tool execution failed";
    const failure = classifyFailure(reason);
    await onProgress?.({ type: "tool_error", tool: call.function.name });
    return { role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: reason, failure_kind: failure.kind, retryable: failure.retryable, safe_alternative: failure.safeAlternative }) };
  }
}


function isTransientToolFailure(result: Extract<ChatCompletionMessageParam, { role: "tool" }>): boolean {
  try {
    const parsed = JSON.parse(String(result.content)) as { error?: unknown };
    if (typeof parsed.error !== "string") return false;
    return /timeout|timed out|temporar|rate.?limit|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|ECONNRESET|ECONNREFUSED|ENOTFOUND|network|socket|fetch failed/i.test(parsed.error);
  } catch {
    return false;
  }
}

/** Retry only transient failures from read-only calls; mutations are never replayed automatically. */
export async function executeToolCall(
  call: ToolCallInput,
  telegramId: string,
  onProgress?: (event: ProgressEvent) => Promise<void> | void
): Promise<Extract<ChatCompletionMessageParam, { role: "tool" }>> {
  const retryable = isReadOnlyCall(call);
  const maxAttempts = retryable ? config.AGENT_MAX_READ_RETRIES + 1 : 1;
  let result = await executeToolCallOnce(call, telegramId, onProgress);
  for (let attempt = 2; attempt <= maxAttempts && isTransientToolFailure(result); attempt++) {
    await onProgress?.({
      type: "recovery_retry",
      tool: call.function.name,
      attempt,
      maxAttempts
    });
    const delayMs = Math.min(1_000 * 2 ** (attempt - 2), 4_000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    result = await executeToolCallOnce(call, telegramId, onProgress);
  }
  return result;
}

export function isReadOnlyCall(call: ToolCallInput): boolean {
  try {
    const args = parseToolArguments(call.function.name, call.function.arguments);
    switch (call.function.name) {
      case "web_search":
      case "fetch":
        return true;
      case "file_io":
        return ["read", "grep", "list"].includes(String(args.operation));
      case "memory":
        return args.operation === "recall";
      case "schedule":
        return args.operation === "list";
      case "workflow":
        return args.operation === "list";
      case "calendar":
        return args.operation === "list";
      case "github":
        return args.operation === "list_operations" || args.operation === "get_operation";
      case "notion":
      case "gmail":
      case "nallputer":
        return args.operation === "list_operations" || args.operation === "get_operation";
      default:
        return false;
    }
  } catch {
    return false;
  }
}

export function isAllowedCall(call: ToolCallInput, allowedTools?: ReadonlySet<string>): boolean {
  return !allowedTools || allowedTools.has(call.function.name);
}

const MAX_PARALLEL_TOOL_CALLS = config.AGENT_MAX_PARALLEL_TOOL_CALLS;

/** Preserve model call order while running only bounded, read-only batches concurrently. */
export async function executeToolCalls(
  calls: ToolCallInput[],
  telegramId: string,
  onProgress?: (event: ProgressEvent) => Promise<void> | void,
  allowedTools?: ReadonlySet<string>,
  readOnlyOnly = false
): Promise<Extract<ChatCompletionMessageParam, { role: "tool" }>[]> {
  let progressQueue: Promise<void> = Promise.resolve();
  const reportProgress = onProgress
    ? (event: ProgressEvent): Promise<void> => {
        progressQueue = progressQueue.then(() => onProgress(event)).catch((error) => {
          console.warn("Tool progress reporting failed:", error);
        });
        return progressQueue;
      }
    : undefined;

  const results: Extract<ChatCompletionMessageParam, { role: "tool" }>[] = [];
  let index = 0;
  while (index < calls.length) {
    if (!isAllowedCall(calls[index]!, allowedTools)) {
      results.push({
        role: "tool",
        tool_call_id: calls[index]!.id,
        content: JSON.stringify({ error: "This tool is not allowed for the current workflow." })
      });
      index++;
      continue;
    }
    if (readOnlyOnly && !isReadOnlyCall(calls[index]!)) {
      results.push({
        role: "tool",
        tool_call_id: calls[index]!.id,
        content: JSON.stringify({ error: "This workflow cannot perform mutations automatically. User confirmation is required before this action." })
      });
      index++;
      continue;
    }
    if (!isReadOnlyCall(calls[index]!)) {
      results.push(await executeToolCall(calls[index]!, telegramId, reportProgress));
      index++;
      continue;
    }

    const batch: ToolCallInput[] = [];
    while (index < calls.length && batch.length < MAX_PARALLEL_TOOL_CALLS && isReadOnlyCall(calls[index]!)) {
      batch.push(calls[index]!);
      index++;
    }
    results.push(...await Promise.all(batch.map((call) => executeToolCall(call, telegramId, reportProgress))));
  }
  return results;
}
