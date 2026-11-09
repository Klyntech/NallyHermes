import assert from "node:assert/strict";
import test from "node:test";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nvidia-key";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
process.env.WEBHOOK_URL = "https://example.test";
process.env.WEBHOOK_SECRET = "e".repeat(32);
process.env.LIGHTRAG_ENABLED = "false";

const { buildFollowUpContext } = await import("../src/agent/followUpContext.js");
const { userFacingReminderTask } = await import("../src/agent/reminderMessage.js");

test("short follow-ups stay anchored to the active event topic", () => {
  const history: ChatCompletionMessageParam[] = [
    { role: "user", content: "Message me when Barcelona match starts today" },
    { role: "assistant", content: "The kickoff time is uncertain. I found a provisional time of 9 PM." }
  ];
  const context = buildFollowUpContext(history, "Confirm time");
  assert.ok(context);
  assert.match(context, /active topic/);
  assert.match(context, /match starts/);
  assert.match(context, /not report the current clock time/);
});

test("long ordinary requests do not receive short-follow-up instructions", () => {
  assert.equal(buildFollowUpContext([], "Please research the latest Barcelona match schedule"), null);
});

test("internal reminder instructions are converted to user-facing task text", () => {
  assert.equal(userFacingReminderTask("Check and message the user with the Barcelona scoreline"), "the Barcelona scoreline");
  assert.equal(userFacingReminderTask("remind the user to check the deployment logs"), "check the deployment logs");
});
