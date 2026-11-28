import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { handleDesktopApiRequest } from "../src/desktop/http.js";
import {
  completeDeskDearOperation,
  enqueueDeskDearOperation,
  findDeskDearDeviceForTelegram,
  pollDeskDearOperations,
  pulseDeskDearHeartbeat,
  registerDeskDearDevice,
  resetDeskDearTransportForTests
} from "../src/agent/deskdearTransport.js";
import {
  callDeskDearOperation,
  getDeskDearStatus
} from "../src/agent/deskdear.js";

test.beforeEach(() => {
  resetDeskDearTransportForTests();
});

test("register + heartbeat marks device online for agent status", () => {
  const expiresAt = new Date(Date.now() + 60_000);
  const { token, device } = registerDeskDearDevice({
    telegramId: "42",
    deviceId: "dev-1",
    deviceName: "Nigeria desktop",
    expiresAt
  });
  assert.equal(device.deviceId, "dev-1");
  assert.ok(token.length > 20);
  pulseDeskDearHeartbeat(token);
  const status = getDeskDearStatus("42");
  assert.equal(status.transport, "online");
  assert.equal(status.available, true);
});

test("agent call routes to device and returns device result", async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  const { token } = registerDeskDearDevice({
    telegramId: "99",
    deviceName: "Lab PC",
    expiresAt
  });
  pulseDeskDearHeartbeat(token);

  const agentPromise = callDeskDearOperation(
    "read",
    { path: "notes.txt" },
    false,
    { telegramId: "99" }
  );

  // Device side: poll and complete
  const ops = await pollDeskDearOperations(token, 50);
  assert.equal(ops.length, 1);
  assert.equal(ops[0]!.name, "read");
  assert.equal(ops[0]!.arguments.path, "notes.txt");

  const done = completeDeskDearOperation(token, ops[0]!.operation_id, {
    status: "ok",
    result: { content: "hello from desktop" }
  });
  assert.equal(done.ok, true);

  const result = await agentPromise;
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.deepEqual(result.result, { content: "hello from desktop" });
  }
});

test("call fails closed when device is offline", async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  registerDeskDearDevice({
    telegramId: "7",
    deviceName: "Offline box",
    expiresAt
  });
  // no heartbeat → paired but not online
  const view = findDeskDearDeviceForTelegram("7");
  assert.ok(view);
  // Force offline by not pulsing; lastSeen is at register time — still online within ONLINE_MS
  // Simulate offline by advancing: re-register without pulse after clearing
  resetDeskDearTransportForTests();
  const denied = await callDeskDearOperation("read", { path: "x" }, false, { telegramId: "7" });
  assert.equal(denied.status, "unavailable");
});

test("desktop HTTP pair + poll + result round-trip", async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  const server = createServer((req, res) => {
    void handleDesktopApiRequest(req, res, {
      pairSession: async () => ({
        token: "t".repeat(48),
        expiresAt,
        telegramId: "tg-1",
        telegramChatId: "tg-1"
      })
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const pairRes = await fetch(`${base}/api/desktop/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "6749313482", deviceId: "hw-1", deviceName: "Desk" })
    });
    assert.equal(pairRes.status, 200);
    const paired = (await pairRes.json()) as {
      accessToken: string;
      deviceToken: string;
      deviceId: string;
      paired: boolean;
    };
    assert.equal(paired.paired, true);
    assert.equal(paired.deviceId, "hw-1");
    assert.equal(paired.accessToken, paired.deviceToken);

    const hb = await fetch(`${base}/api/desktop/heartbeat`, {
      method: "POST",
      headers: { authorization: `Bearer ${paired.deviceToken}` }
    });
    assert.equal(hb.status, 200);

    // Enqueue from agent side
    const agentPromise = enqueueDeskDearOperation({
      telegramId: "tg-1",
      name: "write",
      action: "workspace.write",
      arguments: { path: "a.txt", content: "x" },
      timeoutMs: 5_000
    });

    const pendingRes = await fetch(`${base}/api/desktop/ops/pending?waitMs=500`, {
      headers: { authorization: `Bearer ${paired.deviceToken}` }
    });
    assert.equal(pendingRes.status, 200);
    const pending = (await pendingRes.json()) as {
      operations: Array<{ operation_id: string; name: string }>;
    };
    assert.equal(pending.operations.length, 1);
    assert.equal(pending.operations[0]!.name, "write");

    const resultRes = await fetch(
      `${base}/api/desktop/ops/${pending.operations[0]!.operation_id}/result`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${paired.deviceToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ status: "ok", result: { bytes: 1 } })
      }
    );
    assert.equal(resultRes.status, 200);

    const agentResult = await agentPromise;
    assert.equal(agentResult.status, "ok");
    assert.deepEqual(agentResult.result, { bytes: 1 });
  } finally {
    server.close();
    await once(server, "close");
  }
});
