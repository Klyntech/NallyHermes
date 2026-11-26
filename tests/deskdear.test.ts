import assert from "node:assert/strict";
import test from "node:test";

const {
  listDeskDearOperations,
  getDeskDearOperation,
  isDeskDearWriteOperation,
  callDeskDearOperation,
  getDeskDearStatus
} = await import("../src/agent/deskdear.js");
const { isWriteOperation } = await import("../src/agent/approvals.js");

test("deskdear catalog exposes phase A ops", () => {
  const ops = listDeskDearOperations();
  assert.ok(ops.some((o) => o.name === "workspace_write"));
  assert.ok(ops.some((o) => o.name === "health"));
  assert.equal(getDeskDearOperation("workspace_read").readOnly, true);
  assert.equal(isDeskDearWriteOperation("workspace_write"), true);
  assert.equal(isDeskDearWriteOperation("health"), false);
});

test("deskdear mutations need approval and fail closed without device", async () => {
  const denied = await callDeskDearOperation("workspace_write", { path: "a.txt", content: "x" }, false);
  assert.equal(denied.status, "denied_local");
  const unavail = await callDeskDearOperation("workspace_write", { path: "a.txt", content: "x" }, true);
  assert.equal(unavail.status, "unavailable");
  const health = await callDeskDearOperation("health", {}, false);
  assert.equal(health.status, "ok");
});

test("approval gate treats deskdear workspace_write as write", () => {
  assert.equal(
    isWriteOperation("deskdear", { operation: "call_operation", name: "workspace_write" }),
    true
  );
  assert.equal(
    isWriteOperation("deskdear", { operation: "list_operations" }),
    false
  );
});

test("status reports not connected", () => {
  const s = getDeskDearStatus();
  assert.equal(s.transport, "not_connected");
  assert.equal(s.available, false);
});
