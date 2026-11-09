import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { WebSocket } from "ws";
import { VoiceWebSocketGateway } from "../src/voice/gateway.js";

test("gateway authenticates, scopes a session, forwards audio and closes cleanly", async () => {
  const receivedAudio: Buffer[] = [];
  let resolveAudio!: () => void;
  const audioReceived = new Promise<void>((resolve) => { resolveAudio = resolve; });
  const gateway = new VoiceWebSocketGateway({
    authenticate: async () => ({ userId: "user-1" }),
    allowedOrigins: new Set(["https://voice.example.test"]),
    onAudioFrame: (_principal, _session, frame) => {
      receivedAudio.push(frame);
      resolveAudio();
    }
  });
  const server = createServer();
  server.on("upgrade", gateway.handleUpgrade);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const client = new WebSocket(`ws://127.0.0.1:${address.port}/voice`, {
    headers: { Origin: "https://voice.example.test" }
  });

  try {
    await once(client, "open");
    const readyPromise = once(client, "message");
    client.send(JSON.stringify({ v: 1, type: "session.start", sessionId: "client-request" }));
    const [readyData] = await readyPromise;
    const readyEvent = JSON.parse(readyData.toString()) as { v: number; type: string; sessionId: string };
    assert.equal(readyEvent.v, 1);
    assert.equal(readyEvent.type, "session.ready");
    assert.match(readyEvent.sessionId, /^[0-9a-f-]{36}$/i);
    const sessionId = readyEvent.sessionId;
    assert.equal(gateway.activeSessions, 1);

    const audio = Buffer.from([1, 2, 3, 4]);
    client.send(audio);
    await audioReceived;
    assert.equal(receivedAudio.length, 1);
    assert.deepEqual(receivedAudio[0], audio);

    const closedPromise = once(client, "message");
    client.send(JSON.stringify({ v: 1, type: "session.stop", sessionId }));
    const [closedData] = await closedPromise;
    assert.deepEqual(JSON.parse(closedData.toString()), {
      v: 1, type: "session.closed", sessionId
    });
    await once(client, "close");
    assert.equal(gateway.activeSessions, 0);
  } finally {
    if (client.readyState === WebSocket.OPEN) client.close();
    await gateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("gateway rejects untrusted browser origins before authentication", async () => {
  let authenticationCalls = 0;
  const gateway = new VoiceWebSocketGateway({
    authenticate: async () => {
      authenticationCalls += 1;
      return { userId: "user-1" };
    },
    allowedOrigins: new Set(["https://trusted.example.test"])
  });
  const server = createServer();
  server.on("upgrade", gateway.handleUpgrade);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const client = new WebSocket(`ws://127.0.0.1:${address.port}/voice`, {
    headers: { Origin: "https://untrusted.example.test" }
  });

  try {
    await new Promise<void>((resolve) => {
      client.once("close", () => resolve());
      client.once("error", () => undefined);
    });
    assert.equal(authenticationCalls, 0);
    assert.equal(gateway.activeSessions, 0);
  } finally {
    await gateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


test("gateway sends only audio from the active response generation", async () => {
  let liveSession: import("../src/voice/session.js").VoiceSession | undefined;
  const gateway = new VoiceWebSocketGateway({
    authenticate: async () => ({ userId: "user-voice" }),
    allowedOrigins: new Set(["https://voice.example.test"]),
    onControlEvent: (_principal, session) => { liveSession = session; }
  });
  const server = createServer();
  server.on("upgrade", gateway.handleUpgrade);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const client = new WebSocket(`ws://127.0.0.1:${address.port}/voice`, {
    headers: { Origin: "https://voice.example.test" }
  });

  try {
    await once(client, "open");
    const readyPromise = once(client, "message");
    client.send(JSON.stringify({ v: 1, type: "session.start", sessionId: "client" }));
    const [readyData] = await readyPromise;
    const { sessionId } = JSON.parse(readyData.toString()) as { sessionId: string };
    const audioStartPromise = new Promise<void>((resolve) => {
      const poll = () => liveSession ? resolve() : setTimeout(poll, 0);
      poll();
    });
    client.send(JSON.stringify({ v: 1, type: "audio.start", sessionId }));
    await audioStartPromise;
    assert.ok(liveSession);
    const turnId = liveSession.beginTurn();
    const lease = liveSession.beginResponse(turnId);
    assert.equal(gateway.sendEvent(sessionId, {
      v: 1, type: "assistant.response_start", sessionId, turnId, generationId: lease.generationId
    }), true);

    const outputPromise = once(client, "message");
    assert.equal(gateway.sendAudioFrame(sessionId, turnId, lease.generationId, Buffer.from([9, 8, 7])), true);
    const [output, isBinary] = await outputPromise;
    assert.equal(isBinary, true);
    assert.deepEqual(Buffer.from(output as Buffer), Buffer.from([9, 8, 7]));

    liveSession.interrupt("barge_in");
    assert.equal(gateway.sendAudioFrame(sessionId, turnId, lease.generationId, Buffer.from([1, 2, 3])), false);
    assert.equal(gateway.sendEvent(sessionId, {
      v: 1, type: "assistant.interrupted", sessionId, turnId,
      generationId: lease.generationId, reason: "barge_in"
    }), true);
  } finally {
    if (client.readyState === WebSocket.OPEN) client.close();
    await gateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
