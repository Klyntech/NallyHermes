/**
 * DeskDear device transport — control-plane side.
 *
 * Devices authenticate with a pairing-issued bearer token, pulse heartbeats,
 * and long-poll for typed operations. The agent enqueues work and waits for
 * a device result (or times out fail-closed).
 *
 * In-process registry is intentional for v1: Hermes and the HTTP surface share
 * one Node process on the control plane. Durable storage can replace the Maps
 * later without changing the public HTTP/agent contracts.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";

export const DESKDEAR_PROTOCOL_VERSION = 1 as const;
export const DESKDEAR_ONLINE_MS = 45_000;
export const DESKDEAR_OP_TIMEOUT_MS = 30_000;
export const DESKDEAR_DEFAULT_POLL_MS = 25_000;

export type DeviceRecord = {
  deviceId: string;
  deviceName: string;
  telegramId: string;
  tokenHash: string;
  lastSeenAt: number;
  expiresAt: number;
  pairedAt: number;
};

export type DeviceView = {
  deviceId: string;
  deviceName: string;
  telegramId: string;
  online: boolean;
  lastSeenAt: number;
  expiresAt: number;
};

export type OperationEnvelope = {
  protocol_version: typeof DESKDEAR_PROTOCOL_VERSION;
  operation_id: string;
  session_id: string;
  name: string;
  action: string;
  arguments: Record<string, unknown>;
  deadline: string;
  created_at: string;
};

export type OperationResultBody = {
  status: "ok" | "error" | "denied" | "cancelled";
  result?: unknown;
  error?: string;
  code?: string;
};

type PendingOp = {
  envelope: OperationEnvelope;
  telegramId: string;
  deviceId: string;
  resolve: (value: OperationResultBody) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function now(): number {
  return Date.now();
}

const devicesByTokenHash = new Map<string, DeviceRecord>();
const devicesByTelegram = new Map<string, string>(); // telegramId → tokenHash
const pendingById = new Map<string, PendingOp>();
const queuesByDevice = new Map<string, string[]>(); // deviceId → operation_id[]
const waitersByDevice = new Map<
  string,
  Array<{
    resolve: (ops: OperationEnvelope[]) => void;
    timer: ReturnType<typeof setTimeout>;
  }>
>();

function isOnline(device: DeviceRecord, at = now()): boolean {
  return at <= device.expiresAt && at - device.lastSeenAt <= DESKDEAR_ONLINE_MS;
}

function touch(device: DeviceRecord, at = now()): void {
  device.lastSeenAt = at;
}

function getDeviceByToken(token: string): DeviceRecord | null {
  if (!token || token.length < 20) return null;
  const device = devicesByTokenHash.get(hashToken(token));
  if (!device) return null;
  if (now() > device.expiresAt) return null;
  return device;
}

export function resetDeskDearTransportForTests(): void {
  for (const op of pendingById.values()) clearTimeout(op.timer);
  for (const waiters of waitersByDevice.values()) {
    for (const w of waiters) clearTimeout(w.timer);
  }
  devicesByTokenHash.clear();
  devicesByTelegram.clear();
  pendingById.clear();
  queuesByDevice.clear();
  waitersByDevice.clear();
}

/**
 * Register or replace the desktop device for a Telegram user after pairing.
 * Returns the plaintext token once (caller must deliver it to DeskDear).
 */
export function registerDeskDearDevice(input: {
  telegramId: string;
  deviceId?: string;
  deviceName?: string;
  /** Existing pairing token (e.g. from mobile pair). If omitted, a new token is minted. */
  token?: string;
  expiresAt: Date;
}): { token: string; device: DeviceView } {
  const telegramId = input.telegramId.trim();
  if (!telegramId) throw new Error("telegramId is required");

  // Drop previous device for this user (one active desktop per account for v1).
  const priorHash = devicesByTelegram.get(telegramId);
  if (priorHash) {
    const prior = devicesByTokenHash.get(priorHash);
    if (prior) {
      devicesByTokenHash.delete(priorHash);
      // Cancel outstanding ops for the old device.
      const q = queuesByDevice.get(prior.deviceId) ?? [];
      for (const id of q) {
        const pending = pendingById.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          pending.resolve({
            status: "cancelled",
            error: "Device re-paired",
            code: "device_replaced"
          });
          pendingById.delete(id);
        }
      }
      queuesByDevice.delete(prior.deviceId);
    }
  }

  const token = input.token ?? randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const at = now();
  const device: DeviceRecord = {
    deviceId: (input.deviceId && input.deviceId.trim()) || `dd_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    deviceName: (input.deviceName && input.deviceName.trim()) || "DeskDear",
    telegramId,
    tokenHash,
    lastSeenAt: at,
    expiresAt: input.expiresAt.getTime(),
    pairedAt: at
  };

  devicesByTokenHash.set(tokenHash, device);
  devicesByTelegram.set(telegramId, tokenHash);
  if (!queuesByDevice.has(device.deviceId)) queuesByDevice.set(device.deviceId, []);

  return {
    token,
    device: {
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      telegramId: device.telegramId,
      online: true,
      lastSeenAt: device.lastSeenAt,
      expiresAt: device.expiresAt
    }
  };
}

export function findDeskDearDeviceForTelegram(telegramId: string): DeviceView | null {
  const hash = devicesByTelegram.get(telegramId);
  if (!hash) return null;
  const device = devicesByTokenHash.get(hash);
  if (!device || now() > device.expiresAt) return null;
  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    telegramId: device.telegramId,
    online: isOnline(device),
    lastSeenAt: device.lastSeenAt,
    expiresAt: device.expiresAt
  };
}

export function deskDearTransportState(telegramId?: string): {
  transport: "not_connected" | "paired" | "online";
  device: DeviceView | null;
} {
  if (!telegramId) return { transport: "not_connected", device: null };
  const device = findDeskDearDeviceForTelegram(telegramId);
  if (!device) return { transport: "not_connected", device: null };
  return {
    transport: device.online ? "online" : "paired",
    device
  };
}

export function authenticateDeskDearDevice(token: string): DeviceView | null {
  const device = getDeviceByToken(token);
  if (!device) return null;
  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    telegramId: device.telegramId,
    online: isOnline(device),
    lastSeenAt: device.lastSeenAt,
    expiresAt: device.expiresAt
  };
}

export function pulseDeskDearHeartbeat(token: string): DeviceView | null {
  const device = getDeviceByToken(token);
  if (!device) return null;
  touch(device);
  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    telegramId: device.telegramId,
    online: true,
    lastSeenAt: device.lastSeenAt,
    expiresAt: device.expiresAt
  };
}

function wakePollWaiters(deviceId: string): void {
  const waiters = waitersByDevice.get(deviceId);
  if (!waiters || waiters.length === 0) return;
  const queue = queuesByDevice.get(deviceId) ?? [];
  if (queue.length === 0) return;

  const ops: OperationEnvelope[] = [];
  for (const id of queue) {
    const pending = pendingById.get(id);
    if (pending) ops.push(pending.envelope);
  }
  if (ops.length === 0) return;

  const waiter = waiters.shift();
  if (!waiter) return;
  clearTimeout(waiter.timer);
  waiter.resolve(ops);
}

/**
 * Agent → device: enqueue a typed operation and wait for the result.
 */
export function enqueueDeskDearOperation(input: {
  telegramId: string;
  name: string;
  action: string;
  arguments: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<OperationResultBody> {
  const view = findDeskDearDeviceForTelegram(input.telegramId);
  if (!view) {
    return Promise.resolve({
      status: "error",
      error: "No DeskDear device is paired for this account.",
      code: "unauthenticated"
    });
  }
  if (!view.online) {
    return Promise.resolve({
      status: "error",
      error: "DeskDear device is paired but offline (no recent heartbeat).",
      code: "session_expired"
    });
  }

  const hash = devicesByTelegram.get(input.telegramId);
  const device = hash ? devicesByTokenHash.get(hash) : undefined;
  if (!device) {
    return Promise.resolve({
      status: "error",
      error: "No DeskDear device is paired for this account.",
      code: "unauthenticated"
    });
  }

  const timeoutMs = input.timeoutMs ?? DESKDEAR_OP_TIMEOUT_MS;
  const operationId = `op_${randomUUID().replace(/-/g, "")}`;
  const created = now();
  const envelope: OperationEnvelope = {
    protocol_version: DESKDEAR_PROTOCOL_VERSION,
    operation_id: operationId,
    session_id: device.deviceId,
    name: input.name,
    action: input.action,
    arguments: input.arguments ?? {},
    deadline: new Date(created + timeoutMs).toISOString(),
    created_at: new Date(created).toISOString()
  };

  return new Promise<OperationResultBody>((resolve) => {
    const timer = setTimeout(() => {
      const pending = pendingById.get(operationId);
      if (!pending) return;
      pendingById.delete(operationId);
      const q = queuesByDevice.get(device.deviceId);
      if (q) {
        const idx = q.indexOf(operationId);
        if (idx >= 0) q.splice(idx, 1);
      }
      resolve({
        status: "error",
        error: "DeskDear operation deadline exceeded waiting for the device.",
        code: "deadline_exceeded"
      });
    }, timeoutMs);

    pendingById.set(operationId, {
      envelope,
      telegramId: input.telegramId,
      deviceId: device.deviceId,
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: () => {
        clearTimeout(timer);
        resolve({
          status: "error",
          error: "DeskDear operation failed internally.",
          code: "internal"
        });
      },
      timer
    });

    const q = queuesByDevice.get(device.deviceId) ?? [];
    q.push(operationId);
    queuesByDevice.set(device.deviceId, q);
    wakePollWaiters(device.deviceId);
  });
}

/**
 * Device → control plane: long-poll for pending operations.
 */
export function pollDeskDearOperations(
  token: string,
  waitMs = DESKDEAR_DEFAULT_POLL_MS
): Promise<OperationEnvelope[]> {
  const device = getDeviceByToken(token);
  if (!device) return Promise.resolve([]);

  touch(device);

  const queue = queuesByDevice.get(device.deviceId) ?? [];
  const ready: OperationEnvelope[] = [];
  for (const id of queue) {
    const pending = pendingById.get(id);
    if (pending) ready.push(pending.envelope);
  }
  if (ready.length > 0 || waitMs <= 0) {
    return Promise.resolve(ready);
  }

  const capped = Math.min(Math.max(waitMs, 0), 30_000);
  return new Promise<OperationEnvelope[]>((resolve) => {
    const entry = {
      resolve: (ops: OperationEnvelope[]) => resolve(ops),
      timer: setTimeout(() => {
        const list = waitersByDevice.get(device.deviceId);
        if (list) {
          const idx = list.indexOf(entry);
          if (idx >= 0) list.splice(idx, 1);
        }
        // Final check after wait
        const q = queuesByDevice.get(device.deviceId) ?? [];
        const ops: OperationEnvelope[] = [];
        for (const id of q) {
          const pending = pendingById.get(id);
          if (pending) ops.push(pending.envelope);
        }
        resolve(ops);
      }, capped)
    };
    const list = waitersByDevice.get(device.deviceId) ?? [];
    list.push(entry);
    waitersByDevice.set(device.deviceId, list);
  });
}

/**
 * Device → control plane: complete an operation.
 */
export function completeDeskDearOperation(
  token: string,
  operationId: string,
  body: OperationResultBody
): { ok: true } | { ok: false; error: string } {
  const device = getDeviceByToken(token);
  if (!device) return { ok: false, error: "Unauthorized" };

  touch(device);

  const pending = pendingById.get(operationId);
  if (!pending) return { ok: false, error: "Unknown or already completed operation" };
  if (pending.deviceId !== device.deviceId) {
    return { ok: false, error: "Operation does not belong to this device" };
  }

  pendingById.delete(operationId);
  const q = queuesByDevice.get(device.deviceId);
  if (q) {
    const idx = q.indexOf(operationId);
    if (idx >= 0) q.splice(idx, 1);
  }
  clearTimeout(pending.timer);
  pending.resolve(body);
  return { ok: true };
}

export function revokeDeskDearDevice(token: string): boolean {
  const device = getDeviceByToken(token);
  if (!device) return false;

  const q = queuesByDevice.get(device.deviceId) ?? [];
  for (const id of q) {
    const pending = pendingById.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve({
        status: "cancelled",
        error: "Device revoked",
        code: "local_revocation"
      });
      pendingById.delete(id);
    }
  }
  queuesByDevice.delete(device.deviceId);
  devicesByTokenHash.delete(device.tokenHash);
  if (devicesByTelegram.get(device.telegramId) === device.tokenHash) {
    devicesByTelegram.delete(device.telegramId);
  }
  return true;
}
