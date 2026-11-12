import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nim-key";
process.env.DATABASE_URL = "postgres://localhost/test";
process.env.WEBHOOK_URL = "https://example.com/webhook";
process.env.WEBHOOK_SECRET = "test-webhook-secret-32-characters-long";

const { listV22Operations, getV22Operation, callV22Operation } = await import("../src/connectors/v22.js");
const { SYSTEM_PROMPT } = await import("../src/agent/definitions.js");

test("V2.2 connectors expose dynamic operation catalogs", () => {
  for (const provider of ["notion", "gmail", "nallputer"] as const) {
    const operations = listV22Operations(provider);
    assert.ok(operations.length >= 7);
    assert.ok(operations.some((item) => item.name === "list_operations") === false);
    assert.equal(getV22Operation(provider, operations[0]!.name).name, operations[0]!.name);
  }
  assert.equal(getV22Operation("gmail", "send_draft").readOnly, false);
  assert.equal(getV22Operation("nallputer", "health").readOnly, true);
});

test("V2.2 connectors fail closed without credentials", async () => {
  await assert.rejects(() => callV22Operation("notion", "search", { query: "law" }), /notion is not configured/);
  await assert.rejects(() => callV22Operation("gmail", "search_messages", { query: "is:unread" }), /gmail is not configured/);
  await assert.rejects(() => callV22Operation("nallputer", "health", {}), /nallputer is not configured/);
});

test("V2.2 prompt requires active memory application and connector safety", () => {
  assert.match(SYSTEM_PROMPT, /incomplete reference/);
  assert.match(SYSTEM_PROMPT, /notion, gmail, and nallputer/);
  assert.match(SYSTEM_PROMPT, /untrusted data/);
});
