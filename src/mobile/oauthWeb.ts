import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export type OAuthProvider = "google" | "github";
export const isOAuthProvider = (value: string): value is OAuthProvider => value === "google" || value === "github";
export const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: "Google", github: "GitHub" };

export type FlowPurpose = "link" | "login";
export type FlowRow = {
  id: string;
  purpose: FlowPurpose;
  provider: OAuthProvider;
  telegramId: string | null;
  telegramChatId: string | null;
  codeChallenge: string | null;
};
export type ProviderIdentity = { providerUserId: string; email: string | null; displayName: string | null };

/** Everything the web handler needs from storage. Implemented by src/db/oauthStore.ts; faked in tests. */
export interface OAuthWebStore {
  createFlow(input: { purpose: FlowPurpose; provider: OAuthProvider; telegramId?: string; telegramChatId?: string; codeChallenge?: string }): Promise<{ state: string; expiresAt: Date }>;
  peekFlow(state: string): Promise<{ purpose: FlowPurpose; provider: OAuthProvider } | null>;
  consumeFlow(state: string): Promise<FlowRow | null>;
  findUserIdByIdentity(provider: OAuthProvider, providerUserId: string): Promise<string | null>;
  findUserIdByTelegramId(telegramId: string): Promise<string | null>;
  linkUserIdentity(input: { userId: string; telegramChatId: string; provider: OAuthProvider; providerUserId: string; email: string | null; displayName: string | null }): Promise<unknown>;
  issueExchangeCode(flowId: string, userId: string): Promise<string>;
}

export type OAuthEnv = {
  baseUrl: string;
  google: { clientId: string; clientSecret: string } | null;
  github: { clientId: string; clientSecret: string } | null;
};

/** Reads OAuth settings from the environment. The public address defaults to WEBHOOK_URL. */
export function readOAuthEnv(env: NodeJS.ProcessEnv = process.env): OAuthEnv {
  const pair = (idKey: string, secretKey: string) => {
    const clientId = env[idKey]?.trim();
    const clientSecret = env[secretKey]?.trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  };
  const base = (env.OAUTH_BASE_URL?.trim() || env.WEBHOOK_URL?.trim() || "").replace(/\/+$/, "");
  return {
    baseUrl: base,
    google: pair("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"),
    github: pair("GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET")
  };
}

export function configuredProviders(env: OAuthEnv): OAuthProvider[] {
  if (!env.baseUrl.startsWith("https://")) return [];
  return (["google", "github"] as const).filter((provider) => env[provider] !== null);
}

export const callbackUrl = (env: OAuthEnv, provider: OAuthProvider): string => `${env.baseUrl}/auth/callback/${provider}`;
export const telegramStartUrl = (env: OAuthEnv, provider: OAuthProvider, state: string): string =>
  `${env.baseUrl}/auth/start/${provider}?s=${encodeURIComponent(state)}`;

export function buildAuthorizeUrl(env: OAuthEnv, provider: OAuthProvider, state: string): string {
  const creds = env[provider];
  if (!creds) throw new Error(`${provider} is not configured`);
  if (provider === "google") {
    const query = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: callbackUrl(env, provider),
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account"
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
  }
  const query = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: callbackUrl(env, provider),
    scope: "read:user user:email",
    state,
    allow_signup: "false"
  });
  return `https://github.com/login/oauth/authorize?${query}`;
}

/** PKCE (S256): the app proves it started the sign-in by presenting the verifier behind its challenge. */
export function verifierMatchesChallenge(verifier: string, challenge: string): boolean {
  const expected = createHash("sha256").update(verifier, "utf8").digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const isValidChallenge = (value: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(value);

type FetchFn = typeof fetch;

async function jsonRequest(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON error body */ }
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  return body;
}

/** Exchanges the authorization code for the user's stable provider id (server side; the secret never leaves the server). */
export async function fetchProviderIdentity(env: OAuthEnv, provider: OAuthProvider, code: string, fetchFn: FetchFn = fetch): Promise<ProviderIdentity> {
  const creds = env[provider];
  if (!creds) throw new Error(`${provider} is not configured`);
  if (provider === "google") {
    const token = await jsonRequest(fetchFn, "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        code, client_id: creds.clientId, client_secret: creds.clientSecret,
        redirect_uri: callbackUrl(env, provider), grant_type: "authorization_code"
      }).toString()
    });
    const accessToken = typeof token.access_token === "string" ? token.access_token : "";
    if (!accessToken) throw new Error("no_access_token");
    const info = await jsonRequest(fetchFn, "https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }
    });
    const sub = typeof info.sub === "string" ? info.sub : "";
    if (!sub) throw new Error("no_subject");
    return {
      providerUserId: sub,
      email: typeof info.email === "string" && info.email_verified !== false ? info.email : null,
      displayName: typeof info.name === "string" ? info.name : null
    };
  }
  const token = await jsonRequest(fetchFn, "https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: creds.clientId, client_secret: creds.clientSecret, code, redirect_uri: callbackUrl(env, provider) })
  });
  const accessToken = typeof token.access_token === "string" ? token.access_token : "";
  if (!accessToken) throw new Error("no_access_token");
  const headers = { authorization: `Bearer ${accessToken}`, accept: "application/vnd.github+json", "user-agent": "NallyHermes" };
  const user = await jsonRequest(fetchFn, "https://api.github.com/user", { headers });
  const id = typeof user.id === "number" || typeof user.id === "string" ? String(user.id) : "";
  if (!id) throw new Error("no_subject");
  let email = typeof user.email === "string" ? user.email : null;
  if (!email) {
    try {
      const response = await fetchFn("https://api.github.com/user/emails", { headers, signal: AbortSignal.timeout(10_000) });
      if (response.ok) {
        const list = await response.json() as Array<{ email?: string; primary?: boolean; verified?: boolean }>;
        email = list.find((row) => row.primary && row.verified)?.email ?? null;
      }
    } catch { /* email is optional */ }
  }
  return {
    providerUserId: id,
    email,
    displayName: typeof user.name === "string" && user.name ? user.name : typeof user.login === "string" ? user.login : null
  };
}

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const APP_LINK = "nallyhermes://auth";

function page(title: string, message: string, options: { ok?: boolean; openApp?: string } = {}): string {
  const accent = options.ok === false ? "#e07a6a" : "#a3b18a";
  const redirect = options.openApp
    ? `<meta http-equiv="refresh" content="0;url=${escapeHtml(options.openApp)}"><script>setTimeout(function(){location.href=${JSON.stringify(options.openApp)}},50)</script>`
    : "";
  const button = options.openApp
    ? `<p><a class="btn" href="${escapeHtml(options.openApp)}">Open Nally</a></p>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>${redirect}<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0c0b;color:#ecebe6;font-family:system-ui,sans-serif}main{max-width:360px;padding:32px;text-align:center}h1{font-size:22px;margin:0 0 12px;color:${accent}}p{color:#9a9e96;line-height:1.5}.btn{display:inline-block;margin-top:12px;padding:12px 22px;border-radius:999px;background:#ecebe6;color:#0b0c0b;text-decoration:none;font-weight:600}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${button}</main></body></html>`;
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
  });
  res.end(html);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  res.end();
}

export type AuthDeps = {
  store: OAuthWebStore;
  notifyTelegram: (telegramId: string, text: string, unlinkProvider?: OAuthProvider) => Promise<void>;
  env?: OAuthEnv;
  fetchFn?: FetchFn;
  now?: () => number;
};

let windowStart = 0;
let windowCount = 0;
const MAX_APP_STARTS_PER_MINUTE = 60;

/** Serves /auth/start, /auth/app and /auth/callback (browser pages). Other paths are ignored. */
export async function handleAuthRequest(req: IncomingMessage, res: ServerResponse, deps: AuthDeps): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean); // ["auth", action, provider]
  if (parts[0] !== "auth" || req.method !== "GET") {
    if (!res.headersSent) sendHtml(res, 404, page("Not found", "This page does not exist.", { ok: false }));
    return;
  }
  const env = deps.env ?? readOAuthEnv();
  const action = parts[1] ?? "";
  const provider = parts[2] ?? "";
  try {
    if (!isOAuthProvider(provider)) {
      sendHtml(res, 404, page("Not found", "Unknown sign-in provider.", { ok: false }));
      return;
    }
    if (!configuredProviders(env).includes(provider)) {
      sendHtml(res, 503, page("Not available", `${PROVIDER_LABEL[provider]} sign-in is not set up on this server yet.`, { ok: false }));
      return;
    }

    if (action === "start") {
      const state = url.searchParams.get("s") ?? "";
      const flow = state ? await deps.store.peekFlow(state) : null;
      if (!flow || flow.provider !== provider) {
        sendHtml(res, 400, page("Link expired", "This sign-in link is invalid or has expired. Send /linknallyaccount in Telegram to get a new one.", { ok: false }));
        return;
      }
      redirect(res, buildAuthorizeUrl(env, provider, state));
      return;
    }

    if (action === "app") {
      const now = (deps.now ?? Date.now)();
      if (now - windowStart >= 60_000) { windowStart = now; windowCount = 0; }
      if (++windowCount > MAX_APP_STARTS_PER_MINUTE) {
        sendHtml(res, 429, page("Too many attempts", "Wait a minute and try again.", { ok: false }));
        return;
      }
      const challenge = url.searchParams.get("challenge") ?? "";
      if (!isValidChallenge(challenge)) {
        sendHtml(res, 400, page("Sign-in failed", "The app sent an invalid request. Please try again.", { ok: false }));
        return;
      }
      const { state } = await deps.store.createFlow({ purpose: "login", provider, codeChallenge: challenge });
      redirect(res, buildAuthorizeUrl(env, provider, state));
      return;
    }

    if (action === "callback") {
      const state = url.searchParams.get("state") ?? "";
      const flow = state ? await deps.store.consumeFlow(state) : null;
      if (!flow || flow.provider !== provider) {
        sendHtml(res, 400, page("Link expired", "This sign-in has expired or was already used. Please start again.", { ok: false }));
        return;
      }
      const label = PROVIDER_LABEL[provider];
      const code = url.searchParams.get("code") ?? "";
      if (url.searchParams.get("error") || !code) {
        if (flow.purpose === "login") {
          sendHtml(res, 200, page("Sign-in cancelled", "You can close this and try again in the app.", { ok: false, openApp: `${APP_LINK}?error=cancelled` }));
        } else {
          sendHtml(res, 200, page("Linking cancelled", `${label} was not linked. You can close this tab.`, { ok: false }));
        }
        return;
      }
      let identity: ProviderIdentity;
      try {
        identity = await fetchProviderIdentity(env, provider, code, deps.fetchFn);
      } catch (error) {
        console.warn("[auth] provider exchange failed:", error instanceof Error ? error.message : "unknown");
        if (flow.purpose === "login") {
          sendHtml(res, 502, page("Sign-in failed", `${label} did not confirm your sign-in. Please try again.`, { ok: false, openApp: `${APP_LINK}?error=provider_failed` }));
        } else {
          sendHtml(res, 502, page("Linking failed", `${label} did not confirm your sign-in. Please try again from Telegram.`, { ok: false }));
        }
        return;
      }

      if (flow.purpose === "link") {
        const telegramId = flow.telegramId ?? "";
        const userId = telegramId ? await deps.store.findUserIdByTelegramId(telegramId) : null;
        if (!userId) {
          sendHtml(res, 400, page("Linking failed", "Start a private chat with NallyHermes in Telegram first, then try again.", { ok: false }));
          return;
        }
        try {
          await deps.store.linkUserIdentity({
            userId, telegramChatId: flow.telegramChatId ?? telegramId, provider,
            providerUserId: identity.providerUserId, email: identity.email, displayName: identity.displayName
          });
        } catch (error) {
          if (error instanceof Error && error.message === "identity_claimed") {
            sendHtml(res, 409, page("Already linked", `That ${label} account is already linked to a different Nally account.`, { ok: false }));
            return;
          }
          throw error;
        }
        const who = identity.email ?? identity.displayName ?? "your account";
        await deps.notifyTelegram(telegramId, `${label} linked (${who}). You can now sign in to the Nally app with ${label} and see this same agent. If this wasn't you, tap below.`, provider)
          .catch((error) => console.warn("[auth] could not notify Telegram:", error));
        sendHtml(res, 200, page(`${label} linked`, "You can close this tab and return to Telegram. Now open the Nally app and continue with " + label + ".", {}));
        return;
      }

      // purpose === "login"
      const userId = await deps.store.findUserIdByIdentity(provider, identity.providerUserId);
      if (!userId) {
        sendHtml(res, 404, page("No account linked", `No Nally account is linked to this ${label} login. In Telegram, send /linknallyaccount first, then try again.`, { ok: false, openApp: `${APP_LINK}?error=not_linked` }));
        return;
      }
      const exchange = await deps.store.issueExchangeCode(flow.id, userId);
      sendHtml(res, 200, page("Signed in", "Returning you to the Nally app…", { openApp: `${APP_LINK}?code=${encodeURIComponent(exchange)}` }));
      return;
    }

    sendHtml(res, 404, page("Not found", "This page does not exist.", { ok: false }));
  } catch (error) {
    console.error("[auth] request failed:", error);
    if (!res.headersSent) sendHtml(res, 500, page("Something went wrong", "Please try again in a moment.", { ok: false }));
  }
}
