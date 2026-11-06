import { and, asc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { scheduledJobs } from "../../db/schema.js";
import { toolRegistry } from "./registry.js";

const schema = z.object({
  operation: z.enum(["create", "list", "update", "cancel"]),
  job_id: z.string().uuid().optional(),
  task: z.string().min(1).max(1000).optional(),
  run_at: z.string().datetime().optional()
});
toolRegistry.register({
  name: "schedule",
  description: "Create, list, update or cancel one-time scheduled Telegram reminders. Use ISO-8601 timestamps with timezone.",
  schema,
  parameters: { type: "object", properties: {
    operation: { type: "string", enum: ["create","list","update","cancel"] },
    job_id: { type: "string", format: "uuid" },
    task: { type: "string", description: "Reminder text" },
    run_at: { type: "string", format: "date-time", description: "ISO-8601 date-time including timezone" }
  }, required: ["operation"], additionalProperties: false },
  async execute(input, context) {
    if (input.operation === "create") {
      if (!input.task || !input.run_at) throw new Error("task and run_at are required.");
      const runAt = new Date(input.run_at);
      if (runAt <= new Date()) throw new Error("Scheduled time must be in the future.");
      const [job] = await db.insert(scheduledJobs).values({ userId: context.userId, task: input.task, runAt, payload: { chatId: context.telegramChatId } }).returning();
      return { scheduled: true, job };
    }
    if (input.operation === "list") {
      return db.select().from(scheduledJobs).where(eq(scheduledJobs.userId, context.userId)).orderBy(asc(scheduledJobs.runAt)).limit(50);
    }
    if (!input.job_id) throw new Error("job_id is required.");
    if (input.operation === "cancel") {
      const [job] = await db.update(scheduledJobs).set({ status: "cancelled" })
        .where(and(eq(scheduledJobs.id, input.job_id), eq(scheduledJobs.userId, context.userId), eq(scheduledJobs.status, "pending"))).returning();
      return { cancelled: Boolean(job) };
    }
    if (!input.task && !input.run_at) throw new Error("Provide task and/or run_at to update.");
    const values: { task?: string; runAt?: Date } = {};
    if (input.task) values.task = input.task;
    if (input.run_at) {
      const date = new Date(input.run_at);
      if (date <= new Date()) throw new Error("Scheduled time must be in the future.");
      values.runAt = date;
    }
    const [job] = await db.update(scheduledJobs).set(values)
      .where(and(eq(scheduledJobs.id, input.job_id), eq(scheduledJobs.userId, context.userId), eq(scheduledJobs.status, "pending"))).returning();
    if (!job) throw new Error("Pending schedule not found.");
    return { updated: true, job };
  }
});

export async function deliverDueJobs(send: (chatId: number, message: string) => Promise<unknown>): Promise<void> {
  const due = await db.select().from(scheduledJobs).where(and(eq(scheduledJobs.status, "pending"), lte(scheduledJobs.runAt, new Date()))).orderBy(asc(scheduledJobs.runAt)).limit(20);
  for (const job of due) {
    const chatId = Number(job.payload.chatId);
    if (!Number.isSafeInteger(chatId)) {
      await db.update(scheduledJobs).set({ status: "failed" }).where(eq(scheduledJobs.id, job.id));
      continue;
    }
    const claimed = await db.update(scheduledJobs).set({ status: "processing" })
      .where(and(eq(scheduledJobs.id, job.id), eq(scheduledJobs.status, "pending"))).returning({ id: scheduledJobs.id });
    if (!claimed.length) continue;
    try {
      await send(chatId, `⏰ Reminder: ${job.task}`);
      await db.update(scheduledJobs).set({ status: "sent" }).where(eq(scheduledJobs.id, job.id));
    } catch (error) {
      console.error("Reminder delivery failed:", error);
      await db.update(scheduledJobs).set({ status: "failed" }).where(eq(scheduledJobs.id, job.id));
    }
  }
}
