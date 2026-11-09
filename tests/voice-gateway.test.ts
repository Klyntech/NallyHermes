import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import test from "node:test";
import { WebSocket } from "ws";
import { VoiceWebSocketGateway } from "../src/voice/gateway.js";

test("gateway authenticates, scopes a session, forwards audio and closes cleanly", async () => {
  const receivedAudio: Buffer[] = [];
  const gateway = new VoiceWebSocketGateway({
    authenticate: async () => ({ userId: "user-1" }),
    allowedOrigins: new Set(["https://voice.example.test"]),
    onAudioFrame: (_principal, _session, frame) => { receivedAudio.push(frame); }
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
    client.send(JSON.stringify({ v: 1, type: "session.start", sessionId: "browser-session-1" }));
    const [readyData] = await readyPromise;
    assert.deepEqual(JSON.parse(readyData.toString()), {
      v: 1, type: "session.ready", sessionId: "browser-session-1"
    });
    assert.equal(gateway.activeSessions, 1);

    const audio = Buffer.from([1, 2, 3, 4]);
    client.send(audio);
    await new Promise<void>((resolve) => {
      const deadline = setTimeout(resolve, 100);
      const check = () => {
        if (receivedAudio.length > 0) {
          clearTimeout(deadline);
          resolve();
        } else setTimeout(check, 1);
      };
      check();
    });
    assert.equal(receivedAudio.length, 1);
    assert.deepEqual(receivedAudio[0], audio);

    const closedPromise = once(client, "message");
    client.send(JSON.stringify({ v: 1, type: "session.stop", sessionId: "browser-session-1" }));
    const [closedData] = await closedPromise;
    assert.deepEqual(JSON.parse(closedData.toString()), {
      v: 1, type: "session.closed", sessionId: "browser-session-1"
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
    await once(client, "error");
    await once(client, "close");
    assert.equal(authenticationCalls, 0);
    assert.equal(gateway.activeSessions, 0);
  } finally {
    await gateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
