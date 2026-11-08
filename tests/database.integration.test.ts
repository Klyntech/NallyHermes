import assert from "node:assert/strict";
import test from "node:test";

const databaseUrl = process.env.NALLY_DATABASE_INTEGRATION_URL;
const enabled = Boolean(databaseUrl);

if (enabled) {
  process.env.TELEGRAM_BOT_TOKEN = "integration-test-token";
  process.env.NVIDIA_NIM_API_KEY = "integration-test-key";
  process.env.DATABASE_URL = databaseUrl;
  process.env.WEBHOOK_URL = "https://example.test";
  process.env.WEBHOOK_SECRET = "b".repeat(32);
  process.env.LIGHTRAG_ENABLED = "false";
}

test("Neon integration persists isolated conversations and durable workflows", { skip: !enabled }, async () => {
  const { db, ensureDatabase } = await import("../src/db/client.js");
  const { users } = await import("../src/db/schema.js");
  const { eq } = await import("drizzle-orm");
  const { appendConversationExchange, getOrCreateConversation, loadConversationHistory } = await import("../src/db/conversationStore.js");
  const { cancelWorkflow, createWorkflow, listWorkflows } = await import("../src/agent/workflows.js");

  await ensureDatabase();
  const telegramId = String(Date.now());
  try {
    await db.insert(users).values({ telegramId, username: "integration-test", firstName: "Integration", timezone: "Africa/Lagos" });

    const privateConversation = await getOrCreateConversation(telegramId, "private-chat");
    const groupConversation = await getOrCreateConversation(telegramId, "group-chat");
    assert.notEqual(privateConversation, groupConversation);

    await appendConversationExchange(privateConversation, "Remember this durable exchange", "It was persisted.");
    const history = await loadConversationHistory(privateConversation);
    assert.deepEqual(history, [
      { role: "user", content: "Remember this durable exchange" },
      { role: "assistant", content: "It was persisted." }
    ]);
    assert.deepEqual(await loadConversationHistory(groupConversation), []);

    const workflow = await createWorkflow(telegramId, {
      name: "Integration briefing",
      instructions: "Summarize open work and report only verified findings.",
      runAt: new Date(Date.now() + 60_000),
      recurrence: "weekly",
      allowedTools: ["web_search", "memory"],
      approvalPolicy: "read_only"
    });
    const listed = await listWorkflows(telegramId);
    assert.equal(listed.length, 1);
    assert.deepEqual(listed[0]?.allowedTools, ["web_search", "memory"]);
    assert.equal(await cancelWorkflow(telegramId, workflow.id), true);
  } finally {
    await db.delete(users).where(eq(users.telegramId, telegramId));
  }
});
