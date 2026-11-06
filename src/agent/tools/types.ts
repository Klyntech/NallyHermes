import type { z } from "zod";
export type ToolContext = { userId: string; telegramChatId: number; signal?: AbortSignal };
export type ToolDefinition<TSchema extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: TSchema;
  parameters: Record<string, unknown>;
  execute: (input: z.infer<TSchema>, context: ToolContext) => Promise<unknown>;
};
export type ToolResult = { ok: boolean; data?: unknown; error?: { code: string; message: string } };
