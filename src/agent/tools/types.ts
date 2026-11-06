import type { z } from "zod";
export type ToolContext = { userId: string; telegramChatId: number; signal?: AbortSignal };
export type ToolDefinition = {
  name: string;
  description: string;
  schema: z.ZodType;
  parameters: Record<string, unknown>;
  execute: (input: any, context: ToolContext) => Promise<unknown>;
};
export type ToolResult = { ok: boolean; data?: unknown; error?: { code: string; message: string } };
