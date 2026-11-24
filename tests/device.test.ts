import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nim-key";
process.env.DATABASE_URL = "postgres://localhost/test";
process.env.WEBHOOK_URL = "https://example.com/webhook";
process.env.WEBHOOK_SECRET = "test-webhook-secret-32-characters-long";

const { MUTATING_CAPABILITIES, requiresDeviceApproval } = await import(
  "../src/agent/device/types.js"
).then(async (types) => {
  const store = await import("../src/agent/device/store.js");
  return { ...types, requiresDeviceApproval: store.requiresDeviceApproval };
});

test("mutating capabilities require approval", () => {
  assert.equal(requiresDeviceApproval("run_command"), true);
  assert.equal(requiresDeviceApproval("write_workspace"), true);
  assert.equal(requiresDeviceApproval("ingest_file"), true);
  assert.equal(requiresDeviceApproval("health"), false);
  assert.equal(requiresDeviceApproval("list_workspace"), false);
  assert.equal(requiresDeviceApproval("notify"), false);
});

test("MUTATING_CAPABILITIES is a non-empty set", () => {
  assert.ok(MUTATING_CAPABILITIES.size >= 5);
  assert.ok(MUTATING_CAPABILITIES.has("run_command"));
});
