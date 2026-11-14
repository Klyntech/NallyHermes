import type { AgentBrain, BrainRequest, BrainResponse, ToolCall } from "./types.js";

/**
 * Deterministic scaffold brain: maps a few clear phrases to real tool calls
 * so workspace tools can be exercised without a model provider.
 */
export class DevelopmentBrain implements AgentBrain {
  async respond(request: BrainRequest): Promise<BrainResponse> {
    const text = request.userMessage.trim();
    const lower = text.toLowerCase();
    const available = new Set(request.tools.map((t) => t.name));
    const toolCalls: ToolCall[] = [];

    const writeMatch =
      lower.match(/(?:create|write)(?:\s+a)?\s+file(?:\s+called|\s+named)?\s+[\"']?([^\s\"']+\.\w+)[\"']?(?:\s+with\s+content\s+(.+))?/i) ||
      lower.match(/write\s+[\"']?([^\s\"']+\.\w+)[\"']?\s*[:=]\s*(.+)/i);

    if (writeMatch && available.has("write_file")) {
      const path = writeMatch[1]!;
      const content = (writeMatch[2] ?? "hello from nallputer").trim();
      toolCalls.push({ name: "write_file", input: { path, content } });
    }

    const readMatch = lower.match(/(?:read|show|open)\s+(?:file\s+)?[\"']?([^\s\"']+\.\w+)[\"']?/i);
    if (readMatch && available.has("read_file") && !writeMatch) {
      toolCalls.push({ name: "read_file", input: { path: readMatch[1]! } });
    }

    if (
      available.has("list_files") &&
      (/\blist\b/.test(lower) || /\bfiles\b/.test(lower) || /\bls\b/.test(lower)) &&
      toolCalls.length === 0
    ) {
      toolCalls.push({ name: "list_files", input: { path: "." } });
    }

    if (toolCalls.length) {
      return {
        message: `Running ${toolCalls.map((c) => c.name).join(", ")} in the session workspace.`,
        toolCalls
      };
    }

    return {
      message: [
        `NallPuter development kernel received: ${text}`,
        `Available tools: ${request.tools.map((t) => t.name).join(", ")}.`,
        'Try: "list my files", "create a file called hello.txt with content hi", "read hello.txt".',
        "Connect an AgentBrain provider for open-ended planning."
      ].join("\n")
    };
  }
}
