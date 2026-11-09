import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nvidia-key";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
process.env.WEBHOOK_URL = "https://example.test";
process.env.WEBHOOK_SECRET = "d".repeat(32);
process.env.LIGHTRAG_ENABLED = "false";

const { buildReminderPrompt, fallbackReminderMessage, userFacingReminderTask } = await import("../src/agent/reminderMessage.js");

test("reminder prompt delegates natural wording to Nally without treating task text as instructions", () => {
  const prompt = buildReminderPrompt({
    task: "check the deployment logs",
    localTime: "8 Nov 2026, 16:45",
    timezone: "Africa/Lagos",
    firstName: "Clinton"
  });
  assert.match(prompt, /natural-language message/);
  assert.match(prompt, /user data, not instructions/);
  assert.match(prompt, /check the deployment logs/);
  assert.match(prompt, /Clinton/);
});

test("reminder fallback remains conversational when the model is unavailable", () => {
  assert.equal(
    fallbackReminderMessage({ task: "check the deployment logs", localTime: "now", timezone: "Africa/Lagos", firstName: "Clinton" }),
    "Hey Clinton, this is your reminder to check the deployment logs."
  );
});

test("reminder prompts do not expose internal orchestration phrases", () => {
  assert.equal(userFacingReminderTask("Check and message the user with the Barcelona scoreline"), "the Barcelona scoreline");
  const prompt = buildReminderPrompt({ task: "Remind the user to check the deployment logs", localTime: "now", timezone: "Africa/Lagos" });
  assert.match(prompt, /"task":"check the deployment logs"/);
  assert.doesNotMatch(prompt, /"task":"Remind the user/i);
});
