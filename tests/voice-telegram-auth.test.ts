import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import {
  clearVoiceSessionCookie,
  issueVoiceSessionCookie,
  verifyTelegramLogin,
  verifyVoiceSessionCookie
} from "../src/voice/telegram-auth.js";

const botToken = "123456:unit-test-token";
const now = 1_800_000_000;

function signedLogin(fields: Record<string, string>): URLSearchParams {
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");
  return new URLSearchParams({ ...fields, hash });
}

test("Telegram login validates signature and returns verified identity", () => {
  const data = signedLogin({ id: "123456789", auth_date: String(now), first_name: "Nally", username: "nally_user" });
  assert.deepEqual(verifyTelegramLogin(data, botToken, { nowSeconds: now }), {
    userId: "123456789", firstName: "Nally", username: "nally_user"
  });
});

test("Telegram login rejects modified, expired and future-dated data", () => {
  const data = signedLogin({ id: "123456789", auth_date: String(now), first_name: "Nally" });
  data.set("first_name", "Attacker");
  assert.equal(verifyTelegramLogin(data, botToken, { nowSeconds: now }), null);
  assert.equal(verifyTelegramLogin(signedLogin({ id: "123", auth_date: String(now - 301) }), botToken, { nowSeconds: now }), null);
  assert.equal(verifyTelegramLogin(signedLogin({ id: "123", auth_date: String(now + 31) }), botToken, { nowSeconds: now }), null);
});

test("voice session cookie is signed, expires and is hardened for same-origin browser use", () => {
  const issued = issueVoiceSessionCookie({ userId: "123456789" }, { botToken, nowSeconds: now, sessionTtlSeconds: 600 });
  assert.match(issued.setCookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.equal(verifyVoiceSessionCookie(`${issued.name}=${issued.value}`, { botToken, nowSeconds: now + 1 })?.userId, "123456789");
  assert.equal(verifyVoiceSessionCookie(`${issued.name}=${issued.value}`, { botToken, nowSeconds: now + 600 }), null);
  assert.equal(verifyVoiceSessionCookie(`${issued.name}=${issued.value}x`, { botToken, nowSeconds: now + 1 }), null);
  assert.match(clearVoiceSessionCookie(), /Max-Age=0/);
});
