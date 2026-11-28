import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildLinkAccountView, handleUnlinkCallback } from "../src/mobile/linkAccount.js";
import {
  buildAuthorizeUrl, escapeHtml, handleAuthRequest, readOAuthEnv, verifierMatchesChallenge,
  type AuthDeps, type FlowRow, type OAuthEnv, type OAuthWebStore
} from "../src/mobile/oauthWeb.js";
import { createHash } from "node:crypto";

const env: OAuthEnv = {
  baseUrl: "https://nally.example.com",
  google: { clientId: "g-id", clientSecret: "g-secret" },
  github: { clientId: "h-id", clientSecret: "h-secret" }
};

function fakeRes() {
  const r = {
    status: 0, headers: {} as Record<string, string>, body: "", headersSent: false,
    writeHead(status: number, headers?: Record<string, string>) { r.status = status; r.headers = headers ?? {}; r.headersSent = true; return r; },
    end(body?: string) { r.body = body ?? ""; }
  };
  return r;
}

const run = async (path: string, deps: AuthDeps) => {
  const res = fakeRes();
  await handleAuthRequest({ url: path, method: "GET" } as IncomingMessage, res as unknown as ServerResponse, deps);
  return res;
};

function fakeStore(overrides: Partial<OAuthWebStore> & { flow?: FlowRow | null } = {}) {
  const calls = { link: [] as unknown[], created: [] as unknown[], issued: [] as unknown[], consumed: [] as string[] };
  const store: OAuthWebStore = {
    createFlow: async (input) => { calls.created.push(input); return { state: "S".repeat(43), expiresAt: new Date() }; },
    peekFlow: async (state) => (state === "good-state-good-state-good-state-0000" ? { purpose: "link", provider: "google" } : null),
    consumeFlow: async (state) => { calls.consumed.push(state); return overrides.flow ?? null; },
    findUserIdByIdentity: async () => null,
    findUserIdByTelegramId: async (id) => (id === "777" ? "user-1" : null),
    linkUserIdentity: async (input) => { calls.link.push(input); },
    issueExchangeCode: async (flowId, userId) => { calls.issued.push([flowId, userId]); return "C".repeat(43); },
    ...overrides
  };
  return { store, calls };
}

function fakeFetch(map: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const key = String(url);
    if (!(key in map)) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(map[key]), { status: 200 });
  }) as typeof fetch;
}

const googleFetch = fakeFetch({
  "https://oauth2.googleapis.com/token": { access_token: "at" },
  "https://openidconnect.googleapis.com/v1/userinfo": { sub: "g-123", email: "a@b.com", email_verified: true, name: "Ada" }
});

const linkFlow: FlowRow = { id: "f1", purpose: "link", provider: "google", telegramId: "777", telegramChatId: "777", codeChallenge: null };
const loginFlow: FlowRow = { id: "f2", purpose: "login", provider: "google", telegramId: null, telegramChatId: null, codeChallenge: "A".repeat(43) };
const callback = (state = "x".repeat(43)) => `/auth/callback/google?code=abc&state=${state}`;

test("start redirects a valid Telegram link state to the provider with our callback", async () => {
  const { store } = fakeStore();
  const res = await run("/auth/start/google?s=good-state-good-state-good-state-0000", { store, env, notifyTelegram: async () => {} });
  assert.equal(res.status, 302);
  const target = new URL(res.headers.location!);
  assert.equal(target.origin + target.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(target.searchParams.get("client_id"), "g-id");
  assert.equal(target.searchParams.get("redirect_uri"), "https://nally.example.com/auth/callback/google");
  assert.equal(target.searchParams.get("state"), "good-state-good-state-good-state-0000");
});

test("start rejects an unknown or expired state", async () => {
  const { store } = fakeStore();
  const res = await run("/auth/start/google?s=nope", { store, env, notifyTelegram: async () => {} });
  assert.equal(res.status, 400);
  assert.match(res.body, /expired/i);
});

test("a provider that is not configured returns 503", async () => {
  const { store } = fakeStore();
  const res = await run("/auth/start/github?s=x", { store, env: { ...env, github: null }, notifyTelegram: async () => {} });
  assert.equal(res.status, 503);
});

test("linking from Telegram stores the identity and notifies with an unlink option", async () => {
  const { store, calls } = fakeStore({ flow: linkFlow });
  const notes: Array<[string, string, string | undefined]> = [];
  const res = await run(callback(), { store, env, fetchFn: googleFetch, notifyTelegram: async (t, text, p) => { notes.push([t, text, p]); } });
  assert.equal(res.status, 200);
  assert.match(res.body, /Google linked/);
  assert.deepEqual(calls.link, [{ userId: "user-1", telegramChatId: "777", provider: "google", providerUserId: "g-123", email: "a@b.com", displayName: "Ada" }]);
  assert.equal(notes.length, 1);
  assert.equal(notes[0]![0], "777");
  assert.equal(notes[0]![2], "google");
});

test("a login already claimed by another account is refused without notifying", async () => {
  const { store } = fakeStore({ flow: linkFlow, linkUserIdentity: async () => { throw new Error("identity_claimed"); } });
  let notified = 0;
  const res = await run(callback(), { store, env, fetchFn: googleFetch, notifyTelegram: async () => { notified++; } });
  assert.equal(res.status, 409);
  assert.equal(notified, 0);
});

test("a link for a Telegram user who has no account yet fails clearly", async () => {
  const { store } = fakeStore({ flow: { ...linkFlow, telegramId: "999" } });
  const res = await run(callback(), { store, env, fetchFn: googleFetch, notifyTelegram: async () => {} });
  assert.equal(res.status, 400);
});

test("app login for a linked identity issues a one-time code and returns to the app", async () => {
  const { store, calls } = fakeStore({ flow: loginFlow, findUserIdByIdentity: async (provider, id) => (provider === "google" && id === "g-123" ? "user-1" : null) });
  const res = await run(callback(), { store, env, fetchFn: googleFetch, notifyTelegram: async () => {} });
  assert.equal(res.status, 200);
  assert.deepEqual(calls.issued, [["f2", "user-1"]]);
  assert.ok(res.body.includes("nallyhermes://auth?code=" + "C".repeat(43)));
});

test("app login for an identity that was never linked says so and tells the app", async () => {
  const { store, calls } = fakeStore({ flow: loginFlow });
  const res = await run(callback(), { store, env, fetchFn: googleFetch, notifyTelegram: async () => {} });
  assert.equal(res.status, 404);
  assert.ok(res.body.includes("nallyhermes://auth?error=not_linked"));
  assert.match(res.body, /linknallyaccount/);
  assert.equal(calls.issued.length, 0);
});

test("the provider returning an error ends the flow without exchanging anything", async () => {
  const { store, calls } = fakeStore({ flow: loginFlow });
  const res = await run("/auth/callback/google?error=access_denied&state=" + "x".repeat(43), { store, env, notifyTelegram: async () => {} });
  assert.ok(res.body.includes("error=cancelled"));
  assert.equal(calls.issued.length, 0);
});

test("a state value cannot be reused or forged at the callback", async () => {
  const { store } = fakeStore({ flow: null });
  const res = await run(callback(), { store, env, fetchFn: googleFetch, notifyTelegram: async () => {} });
  assert.equal(res.status, 400);
});

test("a provider mismatch between the state and the callback is rejected", async () => {
  const { store } = fakeStore({ flow: { ...linkFlow, provider: "github" } });
  const res = await run(callback(), { store, env, fetchFn: googleFetch, notifyTelegram: async () => {} });
  assert.equal(res.status, 400);
});

test("app sign-in start validates the PKCE challenge and creates a login flow", async () => {
  const { store, calls } = fakeStore();
  const bad = await run("/auth/app/google?challenge=short", { store, env, notifyTelegram: async () => {} });
  assert.equal(bad.status, 400);
  const challenge = createHash("sha256").update("v".repeat(50)).digest("base64url");
  const ok = await run(`/auth/app/github?challenge=${challenge}`, { store, env, notifyTelegram: async () => {} });
  assert.equal(ok.status, 302);
  assert.deepEqual(calls.created, [{ purpose: "login", provider: "github", codeChallenge: challenge }]);
  assert.ok(ok.headers.location!.startsWith("https://github.com/login/oauth/authorize?"));
});

test("GitHub identity uses the numeric id and the primary verified email", async () => {
  const gh = fakeFetch({
    "https://github.com/login/oauth/access_token": { access_token: "gt" },
    "https://api.github.com/user": { id: 4242, login: "ada", name: null, email: null },
    "https://api.github.com/user/emails": [{ email: "x@y.com", primary: false, verified: true }, { email: "ada@gh.com", primary: true, verified: true }]
  });
  const { store, calls } = fakeStore({ flow: { ...linkFlow, provider: "github" } });
  const res = await run("/auth/callback/github?code=abc&state=" + "x".repeat(43), { store, env, fetchFn: gh, notifyTelegram: async () => {} });
  assert.equal(res.status, 200);
  assert.deepEqual(calls.link, [{ userId: "user-1", telegramChatId: "777", provider: "github", providerUserId: "4242", email: "ada@gh.com", displayName: "ada" }]);
});

test("PKCE: only the matching verifier is accepted", () => {
  const verifier = "abc".repeat(20);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(verifierMatchesChallenge(verifier, challenge), true);
  assert.equal(verifierMatchesChallenge(verifier + "x", challenge), false);
  assert.equal(verifierMatchesChallenge("", challenge), false);
});

test("environment: providers need both id and secret, and a https base", () => {
  const read = readOAuthEnv({ WEBHOOK_URL: "https://x.onrender.com/", GOOGLE_OAUTH_CLIENT_ID: "a", GOOGLE_OAUTH_CLIENT_SECRET: "b", GITHUB_OAUTH_CLIENT_ID: "c" } as NodeJS.ProcessEnv);
  assert.equal(read.baseUrl, "https://x.onrender.com");
  assert.deepEqual(read.google, { clientId: "a", clientSecret: "b" });
  assert.equal(read.github, null);
  assert.equal(buildAuthorizeUrl(env, "github", "st").includes("allow_signup=false"), true);
});

test("escapeHtml neutralizes markup", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a">`), "&lt;img src=x onerror=&quot;a&quot;&gt;");
});

test("/linknallyaccount view: one button per provider, unlink for linked ones", async () => {
  const made: string[] = [];
  const view = await buildLinkAccountView("777", "777", {
    env,
    createFlow: async (input) => { made.push(input.provider); return { state: `${input.provider}-state` }; },
    listIdentitiesForTelegramId: async () => [{ provider: "google", email: "a@b.com", displayName: null }]
  });
  assert.deepEqual(made, ["google", "github"]);
  assert.deepEqual(view.buttons, [
    { text: "Re-link Google", url: "https://nally.example.com/auth/start/google?s=google-state" },
    { text: "Continue with GitHub", url: "https://nally.example.com/auth/start/github?s=github-state" },
    { text: "Unlink Google", data: "unlink:google" }
  ]);
  assert.match(view.text, /Linked now: Google \(a@b.com\)/);
});

test("/linknallyaccount explains when the server has no OAuth credentials", async () => {
  const view = await buildLinkAccountView("777", "777", {
    env: { ...env, google: null, github: null },
    createFlow: async () => { throw new Error("must not be called"); },
    listIdentitiesForTelegramId: async () => []
  });
  assert.equal(view.buttons.length, 0);
  assert.match(view.text, /isn't set up/);
});

test("unlink button only acts for the owner and valid providers", async () => {
  const store = { findUserIdByTelegramId: async (id: string) => (id === "777" ? "u1" : null), unlinkUserIdentity: async () => true };
  assert.match(await handleUnlinkCallback("777", "google", store), /Google unlinked/);
  assert.match(await handleUnlinkCallback("777", "facebook", store), /not valid/);
  assert.match(await handleUnlinkCallback("123", "google", store), /couldn't find/);
});
