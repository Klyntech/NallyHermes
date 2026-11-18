import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { WebSocket, WebSocketServer } from "ws";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
process.env.NVIDIA_NIM_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.WEBHOOK_URL ??= "https://example.com";
process.env.WEBHOOK_SECRET ??= "12345678901234567890123456789012";
process.env.VOICE_ENABLED = "true";
process.env.DEEPGRAM_API_KEY ??= "test-deepgram-key";
process.env.ELEVENLABS_API_KEY ??= "test-elevenlabs-key";
process.env.ELEVENLABS_VOICE_ID ??= "test-voice-id";

const { attachVoiceWebSocket } = await import("../src/mobile/voiceSession.js");

function createMessageQueue(socket: WebSocket) {
  const messages: Array<{ data: Buffer; binary: boolean }> = [];
  const waiters: Array<(message: { data: Buffer; binary: boolean }) => void> = [];
  socket.on("message", (data, binary) => {
    const message = { data: Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer), binary };
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else messages.push(message);
  });
  return {
    next(timeoutMs = 3_000) {
      const message = messages.shift();
      if (message) return Promise.resolve(message);
      return new Promise<{ data: Buffer; binary: boolean }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out waiting for WebSocket message.")), timeoutMs);
        waiters.push((next) => { clearTimeout(timer); resolve(next); });
      });
    }
  };
}

test("ticket-authenticated voice socket waits for STT readiness and forwards bounded PCM frames", async (t) => {
  const deepgramServer = createServer();
  const deepgramWss = new WebSocketServer({ server: deepgramServer });
  await new Promise<void>((resolve) => deepgramServer.listen(0, "127.0.0.1", resolve));
  const deepgramAddress = deepgramServer.address() as AddressInfo;
  const forwarded = new Promise<Buffer>((resolve) => {
    deepgramWss.once("connection", (upstream) => {
      upstream.on("message", (data, isBinary) => {
        if (isBinary) resolve(Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer));
      });
    });
  });

  const app = createServer();
  const clients: WebSocket[] = [];
  const session = {
    sessionId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    telegramId: "test-user",
    telegramChatId: "test-chat",
    expiresAt: new Date(Date.now() + 60_000)
  };
  attachVoiceWebSocket(
    app,
    async (ticket) => ticket === "one-use-test-ticket" ? session : null,
    {
      deepgram: () => new WebSocket(`ws://127.0.0.1:${deepgramAddress.port}`),
      eleven: () => { throw new Error("TTS is not expected in this transport test."); }
    }
  );
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const appAddress = app.address() as AddressInfo;
  t.after(async () => {
    for (const socket of clients) socket.terminate();
    await new Promise<void>((resolve) => app.close(() => resolve()));
    for (const client of deepgramWss.clients) client.terminate();
    await new Promise<void>((resolve) => deepgramWss.close(() => resolve()));
    await new Promise<void>((resolve) => deepgramServer.close(() => resolve()));
  });

  const url = `ws://127.0.0.1:${appAddress.port}/api/mobile/voice?ticket=one-use-test-ticket`;
  const client = new WebSocket(url);
  clients.push(client);
  const incoming = createMessageQueue(client);
  await once(client, "open");
  const hello = JSON.parse((await incoming.next()).data.toString("utf8"));
  assert.equal(hello.type, "hello");
  assert.equal(hello.protocolVersion, 1);
  client.send(JSON.stringify({ type: "start", protocolVersion: 1 }));
  const ready = JSON.parse((await incoming.next()).data.toString("utf8"));
  assert.equal(ready.type, "ready");
  assert.deepEqual(ready.input, { encoding: "pcm_s16le", sampleRate: 16000, channels: 1 });

  const frame = Buffer.from([0, 0, 1, 0, 2, 0, 3, 0]);
  client.send(frame, { binary: true });
  assert.deepEqual(await forwarded, frame);

  const duplicateStatus = await new Promise<number>((resolve, reject) => {
    const duplicate = new WebSocket(url);
    clients.push(duplicate);
    duplicate.on("unexpected-response", (_request, response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    duplicate.on("open", () => reject(new Error("A second active voice socket unexpectedly opened.")));
    duplicate.on("error", () => undefined);
  });
  assert.equal(duplicateStatus, 429);

  const closed = once(client, "close");
  client.close(1000, "test complete");
  await closed;

  const reconnect = new WebSocket(url);
  clients.push(reconnect);
  const reconnectMessages = createMessageQueue(reconnect);
  await once(reconnect, "open");
  assert.equal(JSON.parse((await reconnectMessages.next()).data.toString("utf8")).type, "hello");
  reconnect.send(JSON.stringify({ type: "start", protocolVersion: 1 }));
  assert.equal(JSON.parse((await reconnectMessages.next()).data.toString("utf8")).type, "ready");
  const reconnectClosed = once(reconnect, "close");
  reconnect.close(1000, "test reconnect complete");
  await reconnectClosed;
});
