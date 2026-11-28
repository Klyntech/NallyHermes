import assert from "node:assert/strict";
import test from "node:test";

const {
  listDeskDearOperations,
  getDeskDearOperation,
  isDeskDearWriteOperation,
  callDeskDearOperation,
  getDeskDearStatus,
  DESKDEAR_OPERATIONS
} = await import("../src/agent/deskdear.js");
const { isWriteOperation } = await import("../src/agent/approvals.js");

/** Must stay aligned with DeskDear tool_registry.cpp public names. */
const DESKDEAR_PUBLIC_NAMES = [
  "status", "read", "write", "list", "info", "mkdir", "mv", "delete", "open",
  "shot", "zoom", "cursor", "move", "click", "drag", "scroll", "type", "key", "hold",
  "wait", "pause", "resume", "cancel"
] as const;

test("Hermes catalog matches DeskDear public tool names", () => {
  const names = DESKDEAR_OPERATIONS.map((o) => o.name);
  assert.deepEqual(names, [...DESKDEAR_PUBLIC_NAMES]);
  assert.equal(listDeskDearOperations().length, 23);
});

test("enabled tools are status, read, write", () => {
  const enabled = DESKDEAR_OPERATIONS.filter((o) => o.state === "enabled").map((o) => o.name);
  assert.deepEqual(enabled, ["status", "read", "write"]);
});

test("approval flags match device registry", () => {
  assert.equal(getDeskDearOperation("write").approvalRequired, true);
  assert.equal(getDeskDearOperation("read").approvalRequired, false);
  assert.equal(getDeskDearOperation("shot").approvalRequired, true);
  assert.equal(isDeskDearWriteOperation("write"), true);
  assert.equal(isDeskDearWriteOperation("status"), false);
});

test("calls fail closed without device; status is local", async () => {
  const status = await callDeskDearOperation("status", {}, false);
  assert.equal(status.status, "ok");
  const denied = await callDeskDearOperation("write", { path: "a.txt", content: "x" }, false);
  assert.equal(denied.status, "denied_local");
  const unavail = await callDeskDearOperation("write", { path: "a.txt", content: "x" }, true);
  assert.equal(unavail.status, "unavailable");
  const planned = await callDeskDearOperation("click", { coordinate: [1, 2] }, true);
  assert.equal(planned.status, "not_implemented");
});

test("approval gate uses DeskDear public names", () => {
  assert.equal(isWriteOperation("deskdear", { operation: "call_operation", name: "write" }), true);
  assert.equal(isWriteOperation("deskdear", { operation: "call_operation", name: "read" }), false);
  assert.equal(isWriteOperation("deskdear", { operation: "list_operations" }), false);
});

test("status reports enabled tool list", () => {
  const s = getDeskDearStatus();
  assert.deepEqual(s.enabledTools, ["status", "read", "write"]);
  assert.equal(s.toolCount, 23);
  assert.equal(s.transport, "not_connected");
});


test("status reflects transport when telegramId is provided", async () => {
  const {
    registerDeskDearDevice,
    pulseDeskDearHeartbeat,
    resetDeskDearTransportForTests
  } = await import("../src/agent/deskdearTransport.js");
  const { getDeskDearStatus } = await import("../src/agent/deskdear.js");
  resetDeskDearTransportForTests();
  assert.equal(getDeskDearStatus("nope").transport, "not_connected");
  const { token } = registerDeskDearDevice({
    telegramId: "555",
    deviceName: "PC",
    expiresAt: new Date(Date.now() + 60_000)
  });
  pulseDeskDearHeartbeat(token);
  assert.equal(getDeskDearStatus("555").transport, "online");
  assert.equal(getDeskDearStatus("555").available, true);
  resetDeskDearTransportForTests();
});
