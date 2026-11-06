import type { ToolContext, ToolDefinition, ToolResult } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  list(): Pick<ToolDefinition, "name" | "description">[] {
    return [...this.tools.values()].map(({ name, description }) => ({ name, description }));
  }

  async execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${name}` } };

    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: { code: "INVALID_INPUT", message: JSON.stringify(parsed.error.flatten()) } };
    }

    try {
      const data = await tool.execute(parsed.data, context);
      return { ok: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed";
      return { ok: false, error: { code: "TOOL_FAILED", message } };
    }
  }
}

export const toolRegistry = new ToolRegistry();
