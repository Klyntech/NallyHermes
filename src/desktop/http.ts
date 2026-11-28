/**
 * DeskDear desktop HTTP surface.
 *
 * POST /api/desktop/pair          — consume pairing code, issue device token
 * POST /api/desktop/heartbeat     — presence pulse (Bearer device token)
 * GET  /api/desktop/ops/pending   — long-poll pending operations
 * POST /api/desktop/ops/:id/result — complete an operation
 * DELETE /api/desktop/session     — revoke this device
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { pairMobileSession } from "../db/mobileStore.js";
import {
  authenticateDeskDearDevice,
  completeDeskDearOperation,
  pollDeskDearOperations,
  pulseDeskDearHeartbeat,
  registerDeskDearDevice,
  revokeDeskDearDevice,
  type OperationResultBody
} from "../agent/deskdearTransport.js";

const MAX_REQUEST_BYTES = 65_536;
let pairingWindowStart = Date.now();
let pairingAttempts = 0;

type PairResult = {
  token: string;
  expiresAt: Date;
  telegramId: string;
  telegramChatId: string;
};

export type DesktopApiDependencies = {
  pairSession?: (code: string) => Promise<PairResult | null>;
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error("payload_too_large");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export async function handleDesktopApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: DesktopApiDependencies = {}
): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if (pathname === "/api/desktop/pair" && req.method === "POST") {
      const at = Date.now();
      if (at - pairingWindowStart >= 60_000) {
        pairingWindowStart = at;
        pairingAttempts = 0;
      }
      pairingAttempts++;
      if (pairingAttempts > 60) {
        sendJson(res, 429, { error: "Too many pairing attempts. Wait a minute and try again." });
        return;
      }

      let body: { code?: unknown; deviceId?: unknown; deviceName?: unknown };
      try {
        body = (await readJson(req)) as typeof body;
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body." });
        return;
      }

      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (!/^\d{10}$/.test(code)) {
        sendJson(res, 400, { error: "Enter a 10-digit pairing code." });
        return;
      }

      const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : undefined;
      const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim() : undefined;

      const paired = await (deps.pairSession ?? pairMobileSession)(code);
      if (!paired) {
        sendJson(res, 401, { error: "That pairing code is invalid, expired, or already used." });
        return;
      }

      const registered = registerDeskDearDevice({
        telegramId: paired.telegramId,
        deviceId,
        deviceName,
        token: paired.token,
        expiresAt: paired.expiresAt
      });

      sendJson(res, 200, {
        paired: true,
        deviceId: registered.device.deviceId,
        deviceToken: registered.token,
        accessToken: registered.token,
        expiresAt: paired.expiresAt.toISOString()
      });
      return;
    }

    if (pathname === "/api/desktop/heartbeat" && req.method === "POST") {
      const token = bearerToken(req);
      if (!token) {
        sendJson(res, 401, { error: "Missing device token." });
        return;
      }
      const device = pulseDeskDearHeartbeat(token);
      if (!device) {
        sendJson(res, 401, { error: "Invalid or expired device token." });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        deviceId: device.deviceId,
        online: true,
        serverTime: new Date().toISOString()
      });
      return;
    }

    if (pathname === "/api/desktop/ops/pending" && req.method === "GET") {
      const token = bearerToken(req);
      if (!token) {
        sendJson(res, 401, { error: "Missing device token." });
        return;
      }
      if (!authenticateDeskDearDevice(token)) {
        sendJson(res, 401, { error: "Invalid or expired device token." });
        return;
      }
      const waitRaw = url.searchParams.get("waitMs");
      const waitMs = waitRaw ? Number(waitRaw) : 25_000;
      const operations = await pollDeskDearOperations(
        token,
        Number.isFinite(waitMs) ? waitMs : 25_000
      );
      sendJson(res, 200, { operations });
      return;
    }

    const resultMatch = /^\/api\/desktop\/ops\/([^/]+)\/result$/.exec(pathname);
    if (resultMatch && req.method === "POST") {
      const token = bearerToken(req);
      if (!token) {
        sendJson(res, 401, { error: "Missing device token." });
        return;
      }
      let body: OperationResultBody;
      try {
        body = (await readJson(req)) as OperationResultBody;
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body." });
        return;
      }
      if (!body || typeof body !== "object" || typeof body.status !== "string") {
        sendJson(res, 400, { error: "Result must include a status field." });
        return;
      }
      const outcome = completeDeskDearOperation(token, decodeURIComponent(resultMatch[1]!), {
        status: body.status,
        result: body.result,
        error: typeof body.error === "string" ? body.error : undefined,
        code: typeof body.code === "string" ? body.code : undefined
      });
      if (!outcome.ok) {
        sendJson(res, 400, { error: outcome.error });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === "/api/desktop/session" && req.method === "DELETE") {
      const token = bearerToken(req);
      if (!token) {
        sendJson(res, 401, { error: "Missing device token." });
        return;
      }
      const revoked = revokeDeskDearDevice(token);
      if (!revoked) {
        sendJson(res, 401, { error: "Invalid or expired device token." });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === "/api/desktop/me" && req.method === "GET") {
      const token = bearerToken(req);
      if (!token) {
        sendJson(res, 401, { error: "Missing device token." });
        return;
      }
      const device = authenticateDeskDearDevice(token);
      if (!device) {
        sendJson(res, 401, { error: "Invalid or expired device token." });
        return;
      }
      sendJson(res, 200, {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        online: device.online,
        lastSeenAt: new Date(device.lastSeenAt).toISOString(),
        expiresAt: new Date(device.expiresAt).toISOString()
      });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    if (message === "payload_too_large") {
      sendJson(res, 413, { error: "Payload too large." });
      return;
    }
    sendJson(res, 500, { error: "Desktop API error." });
  }
}
