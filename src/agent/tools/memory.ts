import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { memories } from "../../db/schema.js";
import { toolRegistry } from "./registry.js";

const schema = z.object({
  operation: z.enum(["recall", "remember", "forget", "update"]),
  memory_id: z.string().uuid().optional(),
  content: z.string().max(5000).optional(),
  query: z.string().max(300).optional()
});
toolRegistry.register({
  name: "memory",
  description: "Manage user-specific long-term memories: recall, remember, forget, update.",
  schema,
  parameters: { type: "object", properties: {
    operation: { type: "string", enum: ["recall","remember","forget","update"] },
    memory_id: { type: "string", format: "uuid" },
    content: { type: "string", description: "Memory text to save or replacement text" },
    query: { type: "string", description: "Optional search text for recall or forget" }
  }, required: ["operation"], additionalProperties: false },
  async execute(input, context) {
    if (input.operation === "remember") {
      if (!input.content?.trim()) throw new Error("content is required.");
      const [row] = await db.insert(memories).values({ userId: context.userId, content: input.content.trim() }).returning();
      return { saved: true, memory: row };
    }
    if (input.operation === "recall") {
      const rows = await db.select().from(memories).where(input.query
        ? and(eq(memories.userId, context.userId), ilike(memories.content, `%${input.query}%`))
        : eq(memories.userId, context.userId)).orderBy(memories.createdAt).limit(30);
      return rows;
    }
    if (input.operation === "forget") {
      if (input.memory_id) {
        const rows = await db.delete(memories).where(and(eq(memories.id, input.memory_id), eq(memories.userId, context.userId))).returning({ id: memories.id });
        return { deleted: rows.length > 0 };
      }
      if (!input.query) throw new Error("memory_id or query is required to forget a memory.");
      const rows = await db.delete(memories).where(and(eq(memories.userId, context.userId), ilike(memories.content, `%${input.query}%`))).returning({ id: memories.id });
      return { deletedCount: rows.length };
    }
    if (!input.memory_id || !input.content?.trim()) throw new Error("memory_id and replacement content are required.");
    const [row] = await db.update(memories).set({ content: input.content.trim(), updatedAt: new Date() })
      .where(and(eq(memories.id, input.memory_id), eq(memories.userId, context.userId))).returning();
    if (!row) throw new Error("Memory not found.");
    return { updated: true, memory: row };
  }
});
