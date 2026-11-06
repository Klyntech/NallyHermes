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
