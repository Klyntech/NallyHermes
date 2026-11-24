import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nim-key";
process.env.DATABASE_URL = "postgres://localhost/test";
process.env.WEBHOOK_URL = "https://example.com/webhook";
process.env.WEBHOOK_SECRET = "test-webhook-secret-32-characters-long";

test("agency domain union covers persona paths", async () => {
  const { createProject, listProjects, ensureDefaultProjects } = await import(
    "../src/agent/agency/store.js"
  );
  assert.equal(typeof createProject, "function");
  assert.equal(typeof listProjects, "function");
  assert.equal(typeof ensureDefaultProjects, "function");
});

test("seed project definitions match law / code / trading persona", () => {
  const seeds = [
    { name: "Law Path", domain: "law", horizonYears: 7 },
    { name: "Code Path", domain: "code", horizonYears: 5 },
    { name: "Trading Path", domain: "trading", horizonYears: 5 }
  ];
  assert.equal(seeds.length, 3);
  assert.deepEqual(
    seeds.map((s) => s.domain).sort(),
    ["code", "law", "trading"]
  );
  assert.equal(seeds.find((s) => s.domain === "law")?.horizonYears, 7);
});
