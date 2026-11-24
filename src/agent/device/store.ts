import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { deviceJobs, devicePairingCodes, devices, users } from "../../db/schema.js";
import type {
  DeviceCapability,
  DeviceJobRecord,
  DeviceJobStatus,
  DeviceKind,
  DeviceRecord,
  DeviceStatus
} from "./types.js";
import { MUTATING_CAPABILITIES } from "./types.js";

async function resolveUserId(telegramId: string): Promise<string | null> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
  return rows[0]?.id ?? null;
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function mapDevice(row: typeof devices.$inferSelect): DeviceRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    label: row.label,
    kind: row.kind as DeviceKind,
    status: row.status as DeviceStatus,
    capabilities: (row.capabilities ?? []) as DeviceCapability[],
    lastSeenAt: row.lastSeenAt,
    pairedAt: row.pairedAt,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapJob(row: typeof deviceJobs.$inferSelect): DeviceJobRecord {
  return {
    id: row.id,
    userId: row.userId,
    deviceId: row.deviceId,
    capability: row.capability as DeviceCapability,
    summary: row.summary,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status as DeviceJobStatus,
    result: (row.result as Record<string, unknown> | null) ?? null,
    error: row.error,
    projectId: row.projectId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt
  };
}

/** Create a short-lived pairing code the device app will submit. */
export async function createPairingCode(input: {
  telegramId: string;
  deviceName: string;
  kind: DeviceKind;
  ttlMinutes?: number;
}): Promise<{ code: string; expiresAt: Date } | { error: string }> {
  const code = randomBytes(3).toString("hex"); // 6 hex chars
  const expiresAt = new Date(Date.now() + (input.ttlMinutes ?? 10) * 60_000);
  await db.insert(devicePairingCodes).values({
    telegramId: input.telegramId,
    codeHash: hashToken(code),
    deviceName: input.deviceName.slice(0, 80),
    kind: input.kind,
    expiresAt
  });
  return { code, expiresAt };
}

/**
 * Device presents pairing code + desired capabilities.
 * Returns device id + raw token (show once).
 */
export async function completePairing(input: {
  code: string;
  capabilities: DeviceCapability[];
  label?: string;
}): Promise<{ deviceId: string; token: string; telegramId: string } | { error: string }> {
  const codeHash = hashToken(input.code.trim().toLowerCase());
  const rows = await db
    .select()
    .from(devicePairingCodes)
    .where(and(eq(devicePairingCodes.codeHash, codeHash), isNull(devicePairingCodes.consumedAt)))
    .limit(1);
  const challenge = rows[0];
  if (!challenge) return { error: "Invalid or already used pairing code." };
  if (challenge.expiresAt.getTime() < Date.now()) return { error: "Pairing code expired." };

  const userId = await resolveUserId(challenge.telegramId);
  if (!userId) return { error: "User not found. Pair from Telegram first." };

  const token = randomBytes(24).toString("base64url");
  const label = (input.label ?? challenge.deviceName).slice(0, 40);

  const [device] = await db
    .insert(devices)
    .values({
      userId,
      name: challenge.deviceName.slice(0, 80),
      label,
      kind: challenge.kind,
      status: "online",
      capabilities: input.capabilities,
      tokenHash: hashToken(token),
      lastSeenAt: new Date(),
      pairedAt: new Date()
    })
    .returning();

  if (!device) return { error: "Failed to register device." };

  await db
    .update(devicePairingCodes)
    .set({ consumedAt: new Date() })
    .where(eq(devicePairingCodes.id, challenge.id));

  return { deviceId: device.id, token, telegramId: challenge.telegramId };
}

export async function listDevices(telegramId: string): Promise<DeviceRecord[]> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return [];
  const rows = await db
    .select()
    .from(devices)
    .where(eq(devices.userId, userId))
    .orderBy(desc(devices.updatedAt))
    .limit(50);
  return rows.map(mapDevice);
}

export async function heartbeatDevice(token: string): Promise<DeviceRecord | { error: string }> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .update(devices)
    .set({ lastSeenAt: new Date(), status: "online", updatedAt: new Date() })
    .where(eq(devices.tokenHash, tokenHash))
    .returning();
  return row ? mapDevice(row) : { error: "Unknown device token." };
}

export async function revokeDevice(
  telegramId: string,
  deviceId: string
): Promise<DeviceRecord | { error: string }> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return { error: "User not found." };
  const [row] = await db
    .update(devices)
    .set({ status: "revoked", tokenHash: null, updatedAt: new Date() })
    .where(and(eq(devices.userId, userId), eq(devices.id, deviceId)))
    .returning();
  return row ? mapDevice(row) : { error: "Device not found." };
}

export function requiresDeviceApproval(capability: DeviceCapability): boolean {
  return MUTATING_CAPABILITIES.has(capability);
}

export async function enqueueDeviceJob(input: {
  telegramId: string;
  deviceId: string;
  capability: DeviceCapability;
  summary: string;
  payload?: Record<string, unknown>;
  projectId?: string;
  /** If true, mark approved immediately (caller already passed approval gate). */
  preApproved?: boolean;
}): Promise<DeviceJobRecord | { error: string }> {
  const userId = await resolveUserId(input.telegramId);
  if (!userId) return { error: "User not found." };

  const deviceRows = await db
    .select()
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.id, input.deviceId)))
    .limit(1);
  const device = deviceRows[0];
  if (!device) return { error: "Device not found." };
  if (device.status === "revoked") return { error: "Device is revoked." };
  if (!((device.capabilities ?? []) as string[]).includes(input.capability)) {
    return { error: `Device does not expose capability: ${input.capability}` };
  }

  const status: DeviceJobStatus =
    input.preApproved || !requiresDeviceApproval(input.capability) ? "approved" : "queued";

  const [row] = await db
    .insert(deviceJobs)
    .values({
      userId,
      deviceId: input.deviceId,
      capability: input.capability,
      summary: input.summary.slice(0, 500),
      payload: input.payload ?? {},
      status,
      projectId: input.projectId ?? null
    })
    .returning();

  return row ? mapJob(row) : { error: "Failed to enqueue job." };
}

/** Device agent pulls next approved jobs. */
export async function claimJobsForDevice(
  token: string,
  limit = 5
): Promise<DeviceJobRecord[] | { error: string }> {
  const tokenHash = hashToken(token);
  const deviceRows = await db.select().from(devices).where(eq(devices.tokenHash, tokenHash)).limit(1);
  const device = deviceRows[0];
  if (!device) return { error: "Unknown device token." };

  await db
    .update(devices)
    .set({ lastSeenAt: new Date(), status: "online", updatedAt: new Date() })
    .where(eq(devices.id, device.id));

  const jobs = await db
    .select()
    .from(deviceJobs)
    .where(and(eq(deviceJobs.deviceId, device.id), eq(deviceJobs.status, "approved")))
    .orderBy(deviceJobs.createdAt)
    .limit(limit);

  const claimed: DeviceJobRecord[] = [];
  for (const job of jobs) {
    const [updated] = await db
      .update(deviceJobs)
      .set({ status: "running", updatedAt: new Date() })
      .where(and(eq(deviceJobs.id, job.id), eq(deviceJobs.status, "approved")))
      .returning();
    if (updated) claimed.push(mapJob(updated));
  }
  return claimed;
}

export async function completeDeviceJob(input: {
  token: string;
  jobId: string;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}): Promise<DeviceJobRecord | { error: string }> {
  const tokenHash = hashToken(input.token);
  const deviceRows = await db.select().from(devices).where(eq(devices.tokenHash, tokenHash)).limit(1);
  const device = deviceRows[0];
  if (!device) return { error: "Unknown device token." };

  const [row] = await db
    .update(deviceJobs)
    .set({
      status: input.ok ? "succeeded" : "failed",
      result: input.result ?? {},
      error: input.error ?? null,
      completedAt: new Date(),
      updatedAt: new Date()
    })
    .where(and(eq(deviceJobs.id, input.jobId), eq(deviceJobs.deviceId, device.id)))
    .returning();

  return row ? mapJob(row) : { error: "Job not found for this device." };
}

export async function approveDeviceJob(
  telegramId: string,
  jobId: string
): Promise<DeviceJobRecord | { error: string }> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return { error: "User not found." };
  const [row] = await db
    .update(deviceJobs)
    .set({ status: "approved", updatedAt: new Date() })
    .where(and(eq(deviceJobs.userId, userId), eq(deviceJobs.id, jobId), eq(deviceJobs.status, "queued")))
    .returning();
  return row ? mapJob(row) : { error: "Job not found or not queued." };
}

export async function denyDeviceJob(
  telegramId: string,
  jobId: string
): Promise<DeviceJobRecord | { error: string }> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return { error: "User not found." };
  const [row] = await db
    .update(deviceJobs)
    .set({ status: "denied", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(deviceJobs.userId, userId), eq(deviceJobs.id, jobId), inArray(deviceJobs.status, ["queued", "approved"])))
    .returning();
  return row ? mapJob(row) : { error: "Job not found." };
}

export async function listRecentJobs(telegramId: string, limit = 20): Promise<DeviceJobRecord[]> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return [];
  const rows = await db
    .select()
    .from(deviceJobs)
    .where(eq(deviceJobs.userId, userId))
    .orderBy(desc(deviceJobs.createdAt))
    .limit(limit);
  return rows.map(mapJob);
}

/** Mark devices offline if no heartbeat within threshold. */
export async function markStaleDevicesOffline(staleMs = 5 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs);
  const rows = await db
    .update(devices)
    .set({ status: "offline", updatedAt: new Date() })
    .where(and(eq(devices.status, "online"), lt(devices.lastSeenAt, cutoff)))
    .returning({ id: devices.id });
  return rows.length;
}
