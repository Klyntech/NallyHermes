import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, workflowRuns, workflows } from "../db/schema.js";
import { getUserTimezone, isValidTimezone } from "./clock.js";

type WorkflowRecurrence = "daily" | "weekly" | "monthly";
export type WorkflowStatus = "active" | "paused" | "cancelled";

export interface WorkflowDefinition {
  id: string;
  userId: string;
  telegramId: string;
  name: string;
  instructions: string;
  trigger: string;
  runAt: Date;
  recurrence: WorkflowRecurrence;
  timezone: string;
  allowedTools: string[];
  approvalPolicy: string;
  outputDestination: string;
  retryPolicy: { max_attempts: number; backoff_seconds: number };
  status: WorkflowStatus;
}

export interface CreateWorkflowInput {
  name: string;
  instructions: string;
  runAt: Date;
  recurrence: WorkflowRecurrence;
  timezone?: string;
  allowedTools?: string[];
  approvalPolicy?: string;
  outputDestination?: string;
  retryPolicy?: { max_attempts?: number; backoff_seconds?: number };
}

function zonedParts(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function localTimeToUtc(parts: ReturnType<typeof zonedParts>, timezone: string): Date {
  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  for (let i = 0; i < 4; i++) {
    const actual = zonedParts(new Date(guess), timezone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    guess += desired - represented;
  }
  return new Date(guess);
}

export function nextWorkflowOccurrence(previous: Date, recurrence: WorkflowRecurrence, timezone: string): Date {
  const parts = zonedParts(previous, timezone);
  if (recurrence === "daily" || recurrence === "weekly") {
    const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + (recurrence === "daily" ? 1 : 7)));
    parts.year = next.getUTCFullYear();
    parts.month = next.getUTCMonth() + 1;
    parts.day = next.getUTCDate();
  } else {
    const year = parts.month === 12 ? parts.year + 1 : parts.year;
    const month = parts.month === 12 ? 1 : parts.month + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    parts.year = year;
    parts.month = month;
    parts.day = Math.min(parts.day, lastDay);
  }
  const next = localTimeToUtc(parts, timezone);
  if (next <= previous) throw new Error("Could not calculate the next workflow occurrence.");
  return next;
}

async function getUserId(telegramId: string): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (!user) throw new Error("User profile is not ready yet.");
  return user.id;
}

function rowToWorkflow(row: typeof workflows.$inferSelect, telegramId: string): WorkflowDefinition {
  return {
    id: row.id,
    userId: row.userId,
    telegramId,
    name: row.name,
    instructions: row.instructions,
    trigger: row.trigger,
    runAt: row.runAt,
    recurrence: row.recurrence as WorkflowRecurrence,
    timezone: row.timezone,
    allowedTools: row.allowedTools,
    approvalPolicy: row.approvalPolicy,
    outputDestination: row.outputDestination,
    retryPolicy: row.retryPolicy,
    status: row.status as WorkflowStatus
  };
}

export async function createWorkflow(telegramId: string, input: CreateWorkflowInput): Promise<WorkflowDefinition> {
  const userId = await getUserId(telegramId);
  if (!input.name.trim() || input.name.length > 120) throw new Error("Workflow name must be 1–120 characters.");
  if (!input.instructions.trim() || input.instructions.length > 4000) throw new Error("Workflow instructions must be 1–4000 characters.");
  if (!Number.isFinite(input.runAt.getTime()) || input.runAt <= new Date() || input.runAt.getTime() > Date.now() + 365 * 86400_000) throw new Error("The first workflow run must be in the future and within one year.");
  const timezone = input.timezone ?? await getUserTimezone(telegramId);
  if (!isValidTimezone(timezone)) throw new Error("Invalid IANA timezone.");
  const supportedTools = new Set(["web_search", "fetch", "memory", "file_io", "schedule", "calendar", "github", "notion", "gmail", "nallputer"]);
  const allowedTools = [...new Set((input.allowedTools ?? ["web_search", "fetch", "memory"]).slice(0, 10))];
  if (allowedTools.some((tool) => !supportedTools.has(tool))) throw new Error("Workflow contains an unsupported tool.");
  const approvalPolicy = input.approvalPolicy ?? "confirm_mutations";
  if (!["read_only", "confirm_mutations"].includes(approvalPolicy)) throw new Error("Approval policy must be read_only or confirm_mutations.");
  if (approvalPolicy === "read_only" && allowedTools.some((tool) => ["file_io", "schedule", "calendar", "github", "notion", "gmail", "nallputer"].includes(tool))) throw new Error("A read_only workflow cannot include mutation-capable tools.");
  if ((input.outputDestination ?? "telegram") !== "telegram") throw new Error("Only Telegram delivery is supported in V2.");
  const retryPolicy = {
    max_attempts: Math.min(5, Math.max(1, input.retryPolicy?.max_attempts ?? 2)),
    backoff_seconds: Math.min(86_400, Math.max(15, input.retryPolicy?.backoff_seconds ?? 60))
  };
  const [row] = await db.insert(workflows).values({
    userId,
    name: input.name.trim(),
    instructions: input.instructions.trim(),
    runAt: input.runAt,
    recurrence: input.recurrence,
    timezone,
    allowedTools,
    approvalPolicy,
    outputDestination: input.outputDestination ?? "telegram",
    retryPolicy
  }).returning();
  if (!row) throw new Error("Workflow could not be created.");
  return rowToWorkflow(row, telegramId);
}

export async function listWorkflows(telegramId: string): Promise<WorkflowDefinition[]> {
  const userId = await getUserId(telegramId);
  const rows = await db.select().from(workflows).where(eq(workflows.userId, userId)).orderBy(asc(workflows.runAt)).limit(100);
  return rows.map((row) => rowToWorkflow(row, telegramId));
}

export async function cancelWorkflow(telegramId: string, workflowId: string): Promise<boolean> {
  const userId = await getUserId(telegramId);
  const rows = await db.update(workflows).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(workflows.id, workflowId), eq(workflows.userId, userId), eq(workflows.status, "active")))
    .returning({ id: workflows.id });
  return rows.length > 0;
}

export async function pauseWorkflow(telegramId: string, workflowId: string): Promise<boolean> {
  const userId = await getUserId(telegramId);
  const rows = await db.update(workflows).set({ status: "paused", updatedAt: new Date() })
    .where(and(eq(workflows.id, workflowId), eq(workflows.userId, userId), eq(workflows.status, "active")))
    .returning({ id: workflows.id });
  return rows.length > 0;
}

export type WorkflowRunner = (workflow: WorkflowDefinition) => Promise<string>;
export type WorkflowDelivery = (telegramId: string, text: string) => Promise<unknown>;

export function startWorkflowWorker(runWorkflow: WorkflowRunner, deliver: WorkflowDelivery): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const due = await db.select({ workflow: workflows, telegramId: users.telegramId })
        .from(workflows)
        .innerJoin(users, eq(workflows.userId, users.id))
        .where(and(eq(workflows.status, "active"), lte(workflows.runAt, new Date())))
        .orderBy(asc(workflows.runAt))
        .limit(10);
      for (const item of due) {
        const workflow = rowToWorkflow(item.workflow, item.telegramId);
        const [previousRun] = await db.select({ attempt: workflowRuns.attempt, status: workflowRuns.status })
          .from(workflowRuns)
          .where(eq(workflowRuns.workflowId, workflow.id))
          .orderBy(desc(workflowRuns.createdAt))
          .limit(1);
        const attempt = previousRun?.status === "failed" ? previousRun.attempt + 1 : 1;
        const [run] = await db.insert(workflowRuns).values({ workflowId: workflow.id, status: "running", attempt }).returning({ id: workflowRuns.id });
        if (!run) continue;
        try {
          const output = await runWorkflow(workflow);
          if (workflow.outputDestination === "telegram") await deliver(workflow.telegramId, output);
          await db.update(workflowRuns).set({ status: "completed", finishedAt: new Date(), output }).where(eq(workflowRuns.id, run.id));
          await db.update(workflows).set({ runAt: nextWorkflowOccurrence(workflow.runAt, workflow.recurrence, workflow.timezone), lastRunAt: new Date(), updatedAt: new Date() }).where(eq(workflows.id, workflow.id));
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Workflow execution failed.";
          await db.update(workflowRuns).set({ status: "failed", finishedAt: new Date(), error: reason }).where(eq(workflowRuns.id, run.id));
          const retryAllowed = attempt < workflow.retryPolicy.max_attempts;
          const nextRun = retryAllowed
            ? new Date(Date.now() + workflow.retryPolicy.backoff_seconds * 1000)
            : nextWorkflowOccurrence(workflow.runAt, workflow.recurrence, workflow.timezone);
          await db.update(workflows).set({ runAt: nextRun, updatedAt: new Date() }).where(eq(workflows.id, workflow.id));
          console.error("Workflow execution failed:", reason);
        }
      }
    } catch (error) {
      console.error("Workflow worker failed:", error);
    } finally {
      running = false;
    }
  };
  setInterval(() => { void tick(); }, 15_000);
  void tick();
}
