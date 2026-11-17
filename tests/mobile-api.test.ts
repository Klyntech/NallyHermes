import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { handleMobileApiRequest, type MobileApiDependencies } from "../src/mobile/http.js";
import type { MobileSession } from "../src/db/mobileStore.js";

async function withServer<T>(
  run: (baseUrl: string) => Promise<T>,
  overrides: Partial<MobileApiDependencies> = {}
): Promise<T> {
  const server = createServer((req, res) => {
    const dependencies: MobileApiDependencies = {
      ...overrides,
      submitMessage: overrides.submitMessage ?? (async () => ({ state: "accepted" })),
      getActivity: overrides.getActivity ?? (() => null)
    };
    void handleMobileApiRequest(req, res, dependencies);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

const testSession: MobileSession = {
  sessionId: "session-id",
  userId: "00000000-0000-4000-8000-000000000001",
  telegramId: "123456789",
  telegramChatId: "123456789",
  expiresAt: new Date(Date.now() + 60_000)
};

test("mobile message history requires a bearer session", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/messages`);
    assert.equal(response.status, 401);
    assert.match((await response.json() as { error: string }).error, /Pair the app/);
  });
});

test("mobile pairing rejects malformed codes before database access", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "1234" })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json() as { error: string }).error, /10-digit code/);
  });
});

test("a valid pairing code returns a native session", async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "6749313482" })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accessToken: "a".repeat(64), expiresAt: expiresAt.toISOString() });
  }, { pairSession: async () => ({ token: "a".repeat(64), expiresAt, telegramId: "123456789", telegramChatId: "123456789" }) });
});

test("Telegram Login challenge returns the configured native flow parameters", async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/login/challenge`, { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      nonce: "n".repeat(43),
      clientId: "1234567890",
      redirectUri: "https://app123456-login.tg.dev/tglogin",
      scopes: ["profile", "telegram:bot_access"],
      expiresAt: expiresAt.toISOString()
    });
  }, {
    createLoginChallenge: async () => ({
      nonce: "n".repeat(43),
      clientId: "1234567890",
      redirectUri: "https://app123456-login.tg.dev/tglogin",
      scopes: ["profile", "telegram:bot_access"],
      expiresAt
    })
  });
});

test("a verified Telegram ID token and unspent nonce create a mobile session", async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  let verified: { idToken: string; nonce: string } | null = null;
  let createdFor: string | null = null;
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/telegram-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "signed-id-token", nonce: "n".repeat(43) })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accessToken: "b".repeat(64), expiresAt: expiresAt.toISOString() });
  }, {
    verifyLoginIdToken: async (idToken, nonce) => {
      verified = { idToken, nonce };
      return { telegramId: "123456789" };
    },
    consumeLoginChallenge: async () => true,
    createTelegramSession: async (telegramId) => {
      createdFor = telegramId;
      return { token: "b".repeat(64), expiresAt, telegramId, telegramChatId: telegramId };
    }
  });
  assert.deepEqual(verified, { idToken: "signed-id-token", nonce: "n".repeat(43) });
  assert.equal(createdFor, "123456789");
});

test("a replayed Telegram Login challenge cannot create another session", async () => {
  let sessionCreationAttempted = false;
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/telegram-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "signed-id-token", nonce: "n".repeat(43) })
    });
    assert.equal(response.status, 401);
    assert.match((await response.json() as { error: string }).error, /expired/);
  }, {
    verifyLoginIdToken: async () => ({ telegramId: "123456789" }),
    consumeLoginChallenge: async () => false,
    createTelegramSession: async () => {
      sessionCreationAttempted = true;
      return null;
    }
  });
  assert.equal(sessionCreationAttempted, false);
});

test("unauthenticated mobile requests do not reveal route existence", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/not-a-route`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
  });
});

test("oversized mobile request bodies are rejected", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "1".repeat(9_000) })
    });
    assert.equal(response.status, 413);
  });
});

test("authenticated mobile submissions pass the paired identity and client id to the worker", async () => {
  let captured: { telegramId: string; clientMessageId: string; text: string } | null = null;
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/messages`, {
      method: "POST",
      headers: { authorization: "Bearer valid-test-token-123456789012345678901234567890123456", "content-type": "application/json" },
      body: JSON.stringify({ clientMessageId: "123e4567-e89b-42d3-a456-426614174000", text: "Hello Nally" })
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { clientMessageId: "123e4567-e89b-42d3-a456-426614174000", state: "accepted" });
  }, {
    authenticateSession: async (token) => token.startsWith("valid-test") ? testSession : null,
    submitMessage: async (pairedSession, input) => {
      captured = { telegramId: pairedSession.telegramId, ...input };
      return { state: "accepted" };
    }
  });
  assert.deepEqual(captured, {
    telegramId: "123456789",
    clientMessageId: "123e4567-e89b-42d3-a456-426614174000",
    text: "Hello Nally"
  });
});

test("voice tickets require mobile auth and return only a short-lived socket ticket", async () => {
  await withServer(async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/api/mobile/voice-ticket`, { method: "POST" });
    assert.equal(unauthenticated.status, 401);
    const response = await fetch(`${baseUrl}/api/mobile/voice-ticket`, {
      method: "POST",
      headers: { authorization: "Bearer valid-test-token-123456789012345678901234567890123456" }
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      ticket: "t".repeat(43),
      expiresAt: "2026-01-01T00:01:00.000Z",
      websocketPath: "/api/mobile/voice"
    });
  }, {
    authenticateSession: async () => testSession,
    createVoiceTicket: async (session) => {
      assert.equal(session.telegramId, testSession.telegramId);
      return { ticket: "t".repeat(43), expiresAt: new Date("2026-01-01T00:01:00.000Z") };
    }
  });
});
