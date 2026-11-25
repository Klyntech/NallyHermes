import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { and, eq, gt, isNull } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/client.js";
import {
  accountSessions,
  magicLinkChallenges,
  nallyAccounts
} from "../db/schema-accounts.js";
import {
  createAccountSession,
  type AccountSessionDeps
} from "../db/accountSessionStore.js";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1_000;
const SESSION_COOKIE = "nally_account_session";
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 8_192) return null;
    chunks.push(part);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function allowedByRateLimit(key: string): boolean {
  const now = Date.now();
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return true;
  }
  if (current.count >= 5) return false;
  current.count += 1;
  return true;
}

function sessionDeps(): AccountSessionDeps {
  const secret = config.ACCOUNT_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Account session secret is not configured");
  return {
    sessionSecret: secret,
    insertSession: async (row) => {
      const [created] = await db.insert(accountSessions).values(row).returning({
        id: accountSessions.id,
        expiresAt: accountSessions.expiresAt
      });
      if (!created) throw new Error("Could not create account session");
      return created;
    },
    findActiveSession: async (tokenHash) => {
      const [row] = await db.select({
        sessionId: accountSessions.id,
        accountId: accountSessions.accountId,
        expiresAt: accountSessions.expiresAt
      }).from(accountSessions).where(and(
        eq(accountSessions.tokenHash, tokenHash),
        gt(accountSessions.expiresAt, new Date()),
        isNull(accountSessions.revokedAt)
      )).limit(1);
      return row ?? null;
    },
    revokeById: async (sessionId) => {
      await db.update(accountSessions).set({ revokedAt: new Date() })
        .where(and(eq(accountSessions.id, sessionId), isNull(accountSessions.revokedAt)));
    },
    getActiveAccount: async (accountId) => {
      const [row] = await db.select({ id: nallyAccounts.id, status: nallyAccounts.status })
        .from(nallyAccounts).where(eq(nallyAccounts.id, accountId)).limit(1);
      return row ?? null;
    }
  };
}

async function sendMagicLink(email: string, token: string): Promise<void> {
  if (!config.RESEND_API_KEY || !config.RESEND_FROM_EMAIL || !config.NALLY_ACCOUNT_URL) {
    throw new Error("Resend or Nally Account URL is not configured");
  }
  const accountUrl = new URL(config.NALLY_ACCOUNT_URL);
  if (accountUrl.protocol !== "https:" && config.NODE_ENV === "production") {
    throw new Error("NALLY_ACCOUNT_URL must use HTTPS in production");
  }
  const link = new URL("/account/verify", accountUrl);
  link.searchParams.set("token", token);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: config.RESEND_FROM_EMAIL,
      to: [email],
      subject: "Your Nally sign-in link",
      text: `Use this one-time link to sign in to Nally. It expires in 15 minutes. If you did not request it, you can ignore this email.\n\n${link.toString()}`,
      html: `<p>Use this one-time link to sign in to Nally. It expires in 15 minutes.</p><p><a href="${link.toString()}">Sign in to Nally</a></p><p>If you did not request it, you can ignore this email.</p>`
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Resend email request failed:", response.status, detail.slice(0, 500));
    throw new Error("Email delivery failed");
  }
}

async function requestMagicLink(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const rawEmail = typeof body?.email === "string" ? body.email.trim() : "";
  if (rawEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    json(res, 400, { error: "Enter a valid email address." });
    return;
  }
  const email = rawEmail.toLowerCase();
  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? "unknown").trim();
  if (!allowedByRateLimit(`email:${email}`) || !allowedByRateLimit(`ip:${ip}`)) {
    json(res, 429, { message: "If this address can receive sign-in links, one will be sent shortly." });
    return;
  }

  try {
    let [account] = await db.select().from(nallyAccounts)
      .where(eq(nallyAccounts.email, email)).limit(1);
    if (!account) {
      try {
        [account] = await db.insert(nallyAccounts).values({
          email,
          displayName: email.split("@")[0],
          timezone: config.DEFAULT_TIMEZONE
        }).returning();
      } catch {
        [account] = await db.select().from(nallyAccounts)
          .where(eq(nallyAccounts.email, email)).limit(1);
      }
    }
    if (!account || account.status !== "active") {
      json(res, 200, { message: "If this address can receive sign-in links, one will be sent shortly." });
      return;
    }

    const token = randomBytes(32).toString("base64url");
    await db.insert(magicLinkChallenges).values({
      email,
      accountId: account.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS)
    });
    await sendMagicLink(email, token);
    json(res, 200, { message: "If this address can receive sign-in links, one will be sent shortly." });
  } catch (error) {
    console.error("Nally magic-link request failed:", error);
    // Keep the response generic to avoid revealing account existence or provider status.
    json(res, 200, { message: "If this address can receive sign-in links, one will be sent shortly." });
  }
}

async function verifyMagicLink(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const token = typeof body?.token === "string" ? body.token : "";
  if (token.length < 40 || token.length > 160) {
    json(res, 400, { error: "This sign-in link is invalid or expired." });
    return;
  }

  try {
    // A single conditional UPDATE makes a challenge single-use under concurrent requests.
    const consumed = await db.execute(
      `UPDATE magic_link_challenges
       SET consumed_at = now()
       WHERE token_hash = '${sha256(token)}'
         AND consumed_at IS NULL
         AND expires_at > now()
       RETURNING account_id, email`
    );
    const row = (consumed as unknown as { rows?: Array<{ account_id: string; email: string }> }).rows?.[0];
    if (!row?.account_id) {
      json(res, 400, { error: "This sign-in link is invalid or expired." });
      return;
    }

    await db.update(nallyAccounts).set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(nallyAccounts.id, row.account_id), eq(nallyAccounts.status, "active")));
    const [account] = await db.select({ id: nallyAccounts.id, status: nallyAccounts.status })
      .from(nallyAccounts).where(eq(nallyAccounts.id, row.account_id)).limit(1);
    if (!account || account.status !== "active") {
      json(res, 400, { error: "This account is unavailable." });
      return;
    }

    const created = await createAccountSession(
      sessionDeps(),
      account.id,
      { userAgent: req.headers["user-agent"]?.slice(0, 500) }
    );
    const secure = config.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("set-cookie",
      `${SESSION_COOKIE}=${created.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`);
    json(res, 200, { authenticated: true, account: { id: account.id } });
  } catch (error) {
    console.error("Nally magic-link verification failed:", error);
    json(res, 500, { error: "Unable to complete sign-in right now." });
  }
}

export async function handleAccountApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (pathname === "/api/account/magic-link" && req.method === "POST") {
    await requestMagicLink(req, res);
    return true;
  }
  if (pathname === "/api/account/verify" && req.method === "POST") {
    await verifyMagicLink(req, res);
    return true;
  }
  return false;
}
