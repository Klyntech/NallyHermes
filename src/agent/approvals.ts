/**
 * Universal write approval gate.
 * Every mutating tool stops for Telegram: Deny | Allow once | Always allow.
 * Always-allow scopes persist in Neon (approval_grants).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { approvalGrants, pendingApprovals } from "../db/schema.js";
import { getGitHubOperation } from "../connectors/github.js";

export type ApprovalDecision = "deny" | "allow" | "always";

/** Pending approvals older than this cannot be claimed (fail-closed). */
export const PENDING_APPROVAL_TTL_MS = 60 * 60 * 1000;


export type PendingApprovalRecord = {
  id: string;
  telegramId: string;
  provider: string;
  operation: string;
  arguments: Record<string, unknown>;
  summary: string;
  status: string;
  createdAt?: string;
};

export type ApprovalNeededResult = {
  status: "needs_approval";
  pending_id: string;
  provider: string;
  operation: string;
  summary: string;
  message: string;
};

/** tool name → operations that mutate external or durable state */
const WRITE_OPS: Record<string, ReadonlySet<string> | "*"> = {
  file_io: new Set(["write", "edit", "delete", "mkdir"]),
  memory: new Set(["remember", "forget", "update"]),
  schedule: new Set(["create", "update", "cancel", "delete"]),
  workflow: new Set(["create", "update", "delete", "start", "stop"]),
  calendar: new Set(["create", "update", "delete"]),
  github: "*", // non-readOnly ops checked via approved flag path; treat call_operation as gated when not read-only list
  notion: new Set(["create_page", "append_blocks", "update_page"]),
  gmail: new Set(["create_draft", "update_draft", "send_draft", "modify_message"]),
  nallputer: new Set(["write_file", "run_command", "run_tests", "run_build", "restart_service"])
};

export function isWriteOperation(toolName: string, args: Record<string, unknown>): boolean {
  const spec = WRITE_OPS[toolName];
  if (!spec) return false;

  if (toolName === "file_io" || toolName === "memory" || toolName === "schedule" || toolName === "workflow" || toolName === "calendar") {
    const op = typeof args.operation === "string" ? args.operation : "";
    return spec instanceof Set ? spec.has(op) : false;
  }

  if (toolName === "notion" || toolName === "gmail" || toolName === "nallputer") {
    const op = typeof args.name === "string" ? args.name : typeof args.operation === "string" ? args.operation : "";
    // list/get are not writes
    if (args.operation === "list_operations" || args.operation === "get_operation") return false;
    if (args.operation === "call_operation" || !args.operation) {
      return spec instanceof Set ? spec.has(op) : false;
    }
    return false;
  }

  if (toolName === "github") {
    if (args.operation === "list_operations" || args.operation === "get_operation") return false;
    if (args.operation === "call_operation") {
      const name = typeof args.name === "string" ? args.name : "";
      try {
        return !getGitHubOperation(name).readOnly;
      } catch {
        // Unknown operations fail closed and require approval before the connector
        // gets a chance to reject them with its own schema/operation error.
        return true;
      }
    }
  }

  return false;
}

export function approvalProvider(toolName: string): string {
  return toolName;
}

export function approvalOperation(toolName: string, args: Record<string, unknown>): string {
  if (typeof args.name === "string" && args.name.trim()) return args.name.trim();
  if (typeof args.operation === "string" && args.operation.trim() && args.operation !== "call_operation") {
    return args.operation.trim();
  }
  if (toolName === "github" && typeof args.name === "string") return args.name;
  return typeof args.operation === "string" ? args.operation : "mutate";
}

export function approvalScope(provider: string, operation: string): string {
  return `${provider}:${operation}`;
}

export async function hasAlwaysAllow(
  telegramId: string,
  provider: string,
  operation: string
): Promise<boolean> {
  const scope = approvalScope(provider, operation);
  const rows = await db
    .select()
    .from(approvalGrants)
    .where(and(eq(approvalGrants.telegramId, telegramId), eq(approvalGrants.provider, provider)));
  return rows.some(
    (r) => r.scope === scope || r.scope === `${provider}:*` || r.scope === "*"
  );
}

export async function grantAlwaysAllow(
  telegramId: string,
  provider: string,
  operation: string
): Promise<void> {
  const scope = approvalScope(provider, operation);
  const existing = await db
    .select()
    .from(approvalGrants)
    .where(
      and(
        eq(approvalGrants.telegramId, telegramId),
        eq(approvalGrants.provider, provider),
        eq(approvalGrants.scope, scope)
      )
    )
    .limit(1);
  if (existing.length) return;
  await db.insert(approvalGrants).values({ telegramId, provider, scope });
  console.info("approval.grant", JSON.stringify({ telegramId, provider, scope }));
}

/** Remove a previously granted always-allow scope (exact operation scope only). */
export async function revokeAlwaysAllow(
  telegramId: string,
  provider: string,
  operation: string
): Promise<number> {
  const scope = approvalScope(provider, operation);
  const rows = await db
    .delete(approvalGrants)
    .where(
      and(
        eq(approvalGrants.telegramId, telegramId),
        eq(approvalGrants.provider, provider),
        eq(approvalGrants.scope, scope)
      )
    )
    .returning({ id: approvalGrants.id });
  if (rows.length) {
    console.info("approval.revoke", JSON.stringify({ telegramId, provider, scope, count: rows.length }));
  }
  return rows.length;
}

export async function createPendingApproval(input: {
  telegramId: string;
  provider: string;
  operation: string;
  arguments: Record<string, unknown>;
  summary: string;
}): Promise<PendingApprovalRecord> {
  const [row] = await db
    .insert(pendingApprovals)
    .values({
      telegramId: input.telegramId,
      provider: input.provider,
      operation: input.operation,
      arguments: input.arguments,
      summary: input.summary.slice(0, 3500),
      status: "pending"
    })
    .returning();
  if (!row) throw new Error("Failed to create pending approval.");
  return {
    id: row.id,
    telegramId: row.telegramId,
    provider: row.provider,
    operation: row.operation,
    arguments: row.arguments as Record<string, unknown>,
    summary: row.summary,
    status: row.status,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? "")
  };
}

export function isPendingExpired(pending: Pick<PendingApprovalRecord, "createdAt" | "status">, now = Date.now()): boolean {
  if (pending.status !== "pending") return false;
  if (!pending.createdAt) return false;
  const created = Date.parse(pending.createdAt);
  if (!Number.isFinite(created)) return false;
  return now - created > PENDING_APPROVAL_TTL_MS;
}

export async function getPendingApproval(id: string): Promise<PendingApprovalRecord | null> {
  const [row] = await db.select().from(pendingApprovals).where(eq(pendingApprovals.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    telegramId: row.telegramId,
    provider: row.provider,
    operation: row.operation,
    arguments: (row.arguments ?? {}) as Record<string, unknown>,
    summary: row.summary,
    status: row.status,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? "")
  };
}

/** Claim a pending approval exactly once before executing its mutation. */
export async function claimPendingApproval(id: string): Promise<boolean> {
  const current = await getPendingApproval(id);
  if (!current || current.status !== "pending") return false;
  if (isPendingExpired(current)) {
    await markPending(id, "failed", { error: "Approval expired before claim." });
    console.info("approval.expired", JSON.stringify({ pending_id: id }));
    return false;
  }
  const rows = await db
    .update(pendingApprovals)
    .set({ status: "approved" })
    .where(and(eq(pendingApprovals.id, id), eq(pendingApprovals.status, "pending")))
    .returning({ id: pendingApprovals.id });
  return rows.length > 0;
}

export async function markPending(
  id: string,
  status: "approved" | "denied" | "executed" | "failed",
  extra?: { result?: Record<string, unknown>; error?: string }
): Promise<void> {
  await db
    .update(pendingApprovals)
    .set({
      status,
      resolvedAt: new Date(),
      result: extra?.result,
      error: extra?.error
    })
    .where(eq(pendingApprovals.id, id));
}

export function summarizeWriteRequest(
  provider: string,
  operation: string,
  args: Record<string, unknown>
): string {
  const bits = [`${provider}.${operation}`];
  const keys = [
    "path", "page_id", "block_id", "command", "title", "id", "repo", "repository",
    "owner", "to", "subject", "query", "name", "file", "branch"
  ];
  for (const key of keys) {
    const v = args[key];
    if (typeof v === "string" && v.trim()) bits.push(`${key}=${v.slice(0, 48)}`);
  }
  if (typeof args.content === "string") bits.push(`content=${args.content.length} chars`);
  if (Array.isArray(args.children)) bits.push(`blocks=${args.children.length}`);
  const nested = args.arguments;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const n = nested as Record<string, unknown>;
    for (const key of keys) {
      const v = n[key];
      if (typeof v === "string" && v.trim()) bits.push(`${key}=${v.slice(0, 48)}`);
    }
    if (typeof n.content === "string") bits.push(`content=${n.content.length} chars`);
    if (Array.isArray(n.children)) bits.push(`blocks=${n.children.length}`);
  }
  return bits.join(" · ").slice(0, 500);
}

export function approvalNeededPayload(pending: PendingApprovalRecord): ApprovalNeededResult {
  return {
    status: "needs_approval",
    pending_id: pending.id,
    provider: pending.provider,
    operation: pending.operation,
    summary: pending.summary,
    message:
      "Write paused for your confirmation. Deny cancels this write. Allow runs it once. Always allow remembers this operation for future runs. Pending approvals expire after one hour."
  };
}

/**
 * If this is a write and not pre-approved, create pending row and return needs_approval.
 * If always-allow, returns null (caller proceeds with approved=true).
 */
export async function gateWriteOrPending(input: {
  telegramId: string;
  toolName: string;
  args: Record<string, unknown>;
  alreadyApproved?: boolean;
  resumeRequest?: string;
}): Promise<ApprovalNeededResult | null> {
  if (input.alreadyApproved) return null;
  if (!isWriteOperation(input.toolName, input.args)) return null;

  const provider = approvalProvider(input.toolName);
  const operation = approvalOperation(input.toolName, input.args);

  if (await hasAlwaysAllow(input.telegramId, provider, operation)) {
    return null;
  }

  const pending = await createPendingApproval({
    telegramId: input.telegramId,
    provider,
    operation,
    arguments: {
      tool: input.toolName,
      ...input.args,
      ...(input.resumeRequest ? { __resume_request: input.resumeRequest } : {})
    },
    summary: summarizeWriteRequest(provider, operation, {
      ...input.args,
      ...((input.args.arguments as Record<string, unknown>) ?? {})
    })
  });
  return approvalNeededPayload(pending);
}
