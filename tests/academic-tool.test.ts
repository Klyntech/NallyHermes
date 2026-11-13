import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nim-key";
process.env.DATABASE_URL = "postgres://localhost/test";
process.env.WEBHOOK_URL = "https://example.com/webhook";
process.env.WEBHOOK_SECRET = "test-webhook-secret-32-characters-long";

const { agentTools } = await import("../src/agent/definitions.js");
const { isReadOnlyCall } = await import("../src/agent/executor.js");

test("academic tool is registered", () => {
  const names = agentTools.map((tool) => tool.function.name);
  assert.ok(names.includes("academic"));
});

test("academic operations are treated as read-only", () => {
  for (const operation of ["list", "search", "get"] as const) {
    const call = {
      id: "1",
      type: "function",
      function: { name: "academic", arguments: JSON.stringify({ operation, query: "s.33", document_id: "x" }) }
    };
    assert.equal(isReadOnlyCall(call), true);
  }
});
