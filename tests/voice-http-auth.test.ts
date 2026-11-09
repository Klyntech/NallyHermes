import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac, createHash } from "node:crypto";
import test from "node:test";
import { createVoiceAuthHandler } from "../src/voice/http-auth.js";

const botToken = "123456:voice-auth-route-test";
const origin = "http://127.0.0.1";

function signedLogin(now: number): Record<string, string> {
  const fields = { id: "987654321", auth_date: String(now), first_name: "Nally" };
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");
  return { ...fields, hash };
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  let persisted = 0;
  const handler = createVoiceAuthHandler({
    botToken,
    botUsername: "nally_test_bot",
    origin,
    persistIdentity: async (identity) => {
      assert.equal(identity.userId, "987654321");
      persisted++;
    }
  });
  const server = createServer((request, response) => {
    void handler(request, response).then((handled) => {
      if (!handled) {
        response.writeHead(404);
        response.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  assert.equal(persisted, 1);
}

test("Telegram web auth issues a session cookie, validates session and logs out", async () => {
  await withServer(async (baseUrl) => {
    const config = await fetch(`${baseUrl}/auth/telegram/config`);
    assert.equal(config.status, 200);
    assert.deepEqual(await config.json(), { botUsername: "nally_test_bot" });

    const login = await fetch(`${baseUrl}/auth/telegram`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(signedLogin(Math.floor(Date.now() / 1000)))
    });
    assert.equal(login.status, 204);
    const setCookie = login.headers.get("set-cookie");
    assert.ok(setCookie);
    assert.match(setCookie, /HttpOnly; Secure; SameSite=Strict/);
    const cookie = setCookie.split(";")[0]!;

    const session = await fetch(`${baseUrl}/auth/session`, { headers: { cookie } });
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), { authenticated: true, userId: "987654321" });

    const logout = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { origin }
    });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);

    const expiredSession = await fetch(`${baseUrl}/auth/session`, { headers: { cookie: logout.headers.get("set-cookie") ?? "" } });
    assert.equal(expiredSession.status, 401);
  });
});

test("Telegram web auth rejects invalid signatures and cross-origin login", async () => {
  await withServer(async (baseUrl) => {
    const crossOrigin = await fetch(`${baseUrl}/auth/telegram`, {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify(signedLogin(Math.floor(Date.now() / 1000)))
    });
    assert.equal(crossOrigin.status, 403);

    const fields = signedLogin(Math.floor(Date.now() / 1000));
    fields.first_name = "forged";
    const invalid = await fetch(`${baseUrl}/auth/telegram`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(fields)
    });
    assert.equal(invalid.status, 401);
  });
});
