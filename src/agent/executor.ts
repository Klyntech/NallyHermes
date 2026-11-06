import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { searchWeb } from "./tools/web.js";
import { fetchUrl, fileIO, memoryTool, scheduleTool } from "./tools/extended.js";
import type { ProgressEvent, ToolProgressReporter } from "./progress.js";

export interface ToolCallInput {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

export async function executeToolCall(
  call: ToolCallInput,
  telegramId: string,
  onProgress?: (event: ProgressEvent) => Promise<void> | void
): Promise<Extract<ChatCompletionMessageParam, { role: "tool" }>> {
  try {
    const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
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
      default:
        result = { error: "Unknown tool." };
    }

    await onProgress?.({ type: "tool_complete", tool: call.function.name });
    return { role: "tool", tool_call_id: call.id, content: JSON.stringify(result) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Tool execution failed";
    await onProgress?.({ type: "tool_error", tool: call.function.name });
    return { role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: reason }) };
  }
}


function isReadOnlyCall(call: ToolCallInput): boolean {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.function.arguments) as Record<string, unknown>;
  } catch {
    return false;
  }
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
}

/** Parallelize only independent read-only calls; keep all mutations sequential. */
export async function executeToolCalls(
  calls: ToolCallInput[],
  telegramId: string,
  onProgress?: (event: ProgressEvent) => Promise<void> | void
): Promise<Extract<ChatCompletionMessageParam, { role: "tool" }>[]> {
  if (calls.length > 1 && calls.every(isReadOnlyCall)) {
    return Promise.all(calls.map((call) => executeToolCall(call, telegramId, onProgress)));
  }

  const results: Extract<ChatCompletionMessageParam, { role: "tool" }>[] = [];
  for (const call of calls) {
    results.push(await executeToolCall(call, telegramId, onProgress));
  }
  return results;
}
