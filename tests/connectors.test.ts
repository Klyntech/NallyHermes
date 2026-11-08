import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nvidia-key";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
process.env.WEBHOOK_URL = "https://example.test";
process.env.WEBHOOK_SECRET = "c".repeat(32);
process.env.LIGHTRAG_ENABLED = "false";

const { connectorUnavailableMessage } = await import("../src/connectors/registry.js");
const { agentTools } = await import("../src/agent/definitions.js");

test("unconfigured connectors fail closed with a clear no-action message", () => {
  assert.match(connectorUnavailableMessage(), /Calendar is not configured/);
  assert.match(connectorUnavailableMessage(), /no external action was taken/);
});

test("Calendar is a distinct agent tool with explicit mutation operations", () => {
  const calendar = agentTools.find((tool) => tool.type === "function" && tool.function.name === "calendar");
  assert.ok(calendar && calendar.type === "function");
  const parameters = calendar.function.parameters as { properties?: Record<string, unknown> };
  assert.deepEqual((parameters.properties?.operation as { enum?: string[] }).enum, ["list", "create", "update", "cancel"]);
});
