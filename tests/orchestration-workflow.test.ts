import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nvidia-key";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
process.env.WEBHOOK_URL = "https://example.test";
process.env.WEBHOOK_SECRET = "a".repeat(32);
process.env.LIGHTRAG_ENABLED = "false";

const { isAllowedCall, isReadOnlyCall } = await import("../src/agent/executor.js");
const { nextWorkflowOccurrence } = await import("../src/agent/workflows.js");

test("workflow tool policies allow only explicitly listed tools", () => {
  const allowed = new Set(["web_search", "memory"]);
  const search = { id: "1", type: "function", function: { name: "web_search", arguments: '{"query":"Nally"}' } };
  const write = { id: "2", type: "function", function: { name: "file_io", arguments: '{"operation":"write","path":"x","content":"y"}' } };
  assert.equal(isAllowedCall(search, allowed), true);
  assert.equal(isAllowedCall(write, allowed), false);
  assert.equal(isReadOnlyCall(search), true);
  assert.equal(isReadOnlyCall(write), false);
});

test("workflow recurrence preserves local wall-clock time", () => {
  const previous = new Date("2026-03-01T08:00:00.000Z");
  const next = nextWorkflowOccurrence(previous, "weekly", "Africa/Lagos");
  assert.equal(next.toISOString(), "2026-03-08T08:00:00.000Z");
});

test("monthly workflow recurrence clamps invalid month dates", () => {
  const previous = new Date("2026-01-31T08:00:00.000Z");
  const next = nextWorkflowOccurrence(previous, "monthly", "Africa/Lagos");
  assert.equal(next.toISOString(), "2026-02-28T08:00:00.000Z");
});
