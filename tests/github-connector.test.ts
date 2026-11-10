import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nim-key";
process.env.DATABASE_URL = "postgres://localhost/test";
process.env.WEBHOOK_URL = "https://example.com/webhook";
process.env.WEBHOOK_SECRET = "test-webhook-secret-32-characters-long";

const { getGitHubOperation, listGitHubOperations, callGitHubOperation } = await import("../src/connectors/github.js");

test("GitHub exposes a compact discoverable operation catalog", () => {
  const operations = listGitHubOperations();
  assert.ok(operations.length >= 7);
  assert.ok(operations.some((operation) => operation.name === "get_file"));
  assert.equal(getGitHubOperation("create_issue").readOnly, false);
  assert.equal(getGitHubOperation("get_repository").readOnly, true);
});

test("GitHub fails closed without a configured PAT and repository allowlist", async () => {
  await assert.rejects(() => callGitHubOperation("get_repository", { owner: "Klyntech", repo: "NallyHermes" }), /GitHub is not configured|allowlist/);
});
