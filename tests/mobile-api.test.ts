import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { handleMobileApiRequest } from "../src/mobile/http.js";
import type { MobileSession } from "../src/db/mobileStore.js";

async function withServer<T>(
  run: (baseUrl: string) => Promise<T>,
  authenticateSession?: (token: string) => Promise<MobileSession | null>,
  submitMessage?: (session: MobileSession, input: { clientMessageId: string; text: string }) => Promise<{ state: "accepted" | "in_progress" | "complete" | "awaiting_approval" | "failed" }>
): Promise<T> {
  const server = createServer((req, res) => {
    void handleMobileApiRequest(req, res, {
      authenticateSession,
      submitMessage: submitMessage ?? (async () => ({ state: "accepted" })),
      getActivity: () => null
    });
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
  const session: MobileSession = {
    sessionId: "session-id",
    userId: "00000000-0000-4000-8000-000000000001",
    telegramId: "123456789",
    telegramChatId: "123456789",
    expiresAt: new Date(Date.now() + 60_000)
  };
  let captured: { telegramId: string; clientMessageId: string; text: string } | null = null;
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mobile/messages`, {
      method: "POST",
      headers: { authorization: "Bearer valid-test-token-123456789012345678901234567890123456", "content-type": "application/json" },
      body: JSON.stringify({ clientMessageId: "123e4567-e89b-42d3-a456-426614174000", text: "Hello Nally" })
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { clientMessageId: "123e4567-e89b-42d3-a456-426614174000", state: "accepted" });
  }, async (token) => token.startsWith("valid-test") ? session : null, async (pairedSession, input) => {
    captured = { telegramId: pairedSession.telegramId, ...input };
    return { state: "accepted" };
  });
  assert.deepEqual(captured, {
    telegramId: "123456789",
    clientMessageId: "123e4567-e89b-42d3-a456-426614174000",
    text: "Hello Nally"
  });
});
