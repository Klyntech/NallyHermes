import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nim-key";
process.env.DATABASE_URL = "postgres://localhost/test";
process.env.WEBHOOK_URL = "https://example.com/webhook";
process.env.WEBHOOK_SECRET = "test-webhook-secret-32-characters-long";

const { isWriteOperation } = await import("../src/agent/approvals.js");

test("read-only GitHub operations do not require approval", () => {
  assert.equal(isWriteOperation("github", {
    operation: "call_operation",
    name: "list_branches",
    arguments: { owner: "Klyntech", repo: "NallyHermes" }
  }), false);
});

test("mutating GitHub operations remain approval-gated", () => {
  assert.equal(isWriteOperation("github", {
    operation: "call_operation",
    name: "create_branch",
    arguments: { owner: "Klyntech", repo: "NallyHermes", branch: "test", sha: "abc" }
  }), true);
});
