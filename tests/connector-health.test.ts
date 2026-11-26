import assert from "node:assert/strict";
import test from "node:test";

const { buildConnectorHealth } = await import("../src/agent/connectorHealth.js");

test("buildConnectorHealth returns stable ids", () => {
  const health = buildConnectorHealth();
  const ids = health.map((h) => h.id);
  for (const id of ["web_search", "github", "notion", "gmail", "calendar", "voice"]) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
  for (const h of health) {
    assert.equal(typeof h.available, "boolean");
  }
});
