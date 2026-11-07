import { z } from "zod";
import { config } from "../config.js";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { searchWeb } from "./tools/web.js";
import { fetchUrl, fileIO, memoryTool, scheduleTool } from "./tools/extended.js";
import type { ProgressEvent, ToolProgressReporter } from "./progress.js";
import type { ExecutionBudget } from "./executionBudget.js";

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
    query: z.string().max(1000).optional()
  }).strict(),
  schedule: z.object({
    operation: z.enum(["create", "list", "cancel"]),
    task: z.string().max(1000).optional(),
    run_at: z.string().max(64).optional(),
    recurrence: z.enum(["daily", "weekly", "monthly"]).optional(),
    timezone: z.string().max(100).optional(),
    id: z.string().max(100).optional()
  }).strict()
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
    await onProgress?.({ type: "tool_start", tool: call.function.name, toolCallId: call.id, args });
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
      default:
        throw new Error("Unknown tool.");
    }

    await onProgress?.({ type: "tool_complete", tool: call.function.name, toolCallId: call.id });
    return { role: "tool", tool_call_id: call.id, content: JSON.stringify(result) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Tool execution failed";
    await onProgress?.({ type: "tool_error", tool: call.function.name, toolCallId: call.id });
    return { role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: reason }) };
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
  onProgress?: (event: ProgressEvent) => Promise<void> | void,
  budget?: ExecutionBudget,
  signal?: AbortSignal
): Promise<Extract<ChatCompletionMessageParam, { role: "tool" }>> {
  if (signal?.aborted) {
    return { role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Request cancelled before tool execution." }) };
  }
  const retryable = isReadOnlyCall(call);
  const maxAttempts = retryable ? config.AGENT_MAX_READ_RETRIES + 1 : 1;
  if (budget && !budget.reserveToolCall()) {
    return { role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "The request tool-call budget was exhausted; no further tool execution was started." }) };
  }
  let result = await executeToolCallOnce(call, telegramId, onProgress);
  for (let attempt = 2; attempt <= maxAttempts && isTransientToolFailure(result); attempt++) {
    if (signal?.aborted) {
      return { role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Request cancelled; transient retry skipped." }) };
    }
    await onProgress?.({
      type: "recovery_retry",
      tool: call.function.name,
      toolCallId: call.id,
      attempt,
      maxAttempts
    });
    const delayMs = Math.min(1_000 * 2 ** (attempt - 2), 4_000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (budget && !budget.reserveToolCall()) {
      return {
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ error: "The request tool-call budget was exhausted; the transient failure was not retried." })
      };
    }
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
      default:
        return false;
    }
  } catch {
    return false;
  }
}

const MAX_PARALLEL_TOOL_CALLS = config.AGENT_MAX_PARALLEL_TOOL_CALLS;

/** Preserve model call order while running only bounded, read-only batches concurrently. */
export async function executeToolCalls(
  calls: ToolCallInput[],
  telegramId: string,
  onProgress?: (event: ProgressEvent) => Promise<void> | void,
  budget?: ExecutionBudget,
  signal?: AbortSignal
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
    if (!isReadOnlyCall(calls[index]!)) {
      results.push(await executeToolCall(calls[index]!, telegramId, reportProgress, budget, signal));
      index++;
      continue;
    }

    const batch: ToolCallInput[] = [];
    while (index < calls.length && batch.length < MAX_PARALLEL_TOOL_CALLS && isReadOnlyCall(calls[index]!)) {
      batch.push(calls[index]!);
      index++;
    }
    results.push(...await Promise.all(batch.map((call) => executeToolCall(call, telegramId, reportProgress, budget, signal))));
  }
  return results;
}
