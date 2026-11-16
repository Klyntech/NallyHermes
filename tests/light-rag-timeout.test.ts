import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nim-key";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
process.env.WEBHOOK_URL = "https://example.test";
process.env.WEBHOOK_SECRET = "a".repeat(32);
process.env.LIGHTRAG_ENABLED = "true";
process.env.LIGHTRAG_API_TOKEN = "test-lightrag-token-012345678901234567890123456789";
process.env.LIGHTRAG_LLM_MODEL = "test-lightrag-model";
process.env.LIGHTRAG_QUERY_TIMEOUT_MS = "250";

const { retrieveMemory } = await import("../src/agent/lightRag.js");

test("semantic memory retrieval fails fast after one bounded request", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls++;
    return await new Promise<Response>((_resolve, reject) => {
      const fallback = setTimeout(() => reject(new Error("Mock fetch did not receive an abort signal")), 2_000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(fallback);
        reject(new DOMException("Request timed out", "TimeoutError"));
      }, { once: true });
    });
  }) as typeof fetch;

  const startedAt = Date.now();
  try {
    await assert.rejects(retrieveMemory("12345", "What do I prefer?"), /timed out.*limit 1s/);
    assert.equal(calls, 1);
    assert.ok(Date.now() - startedAt < 1_500, "query should fail open within a short bounded interval");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
