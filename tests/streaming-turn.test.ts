import assert from "node:assert/strict";
import { test } from "node:test";
import { streamModelTurn, TurnAccumulator, type ChunkLike } from "../src/agent/streamingTurn.js";

async function* chunks(list: ChunkLike[]): AsyncGenerator<ChunkLike> {
  for (const chunk of list) yield chunk;
}

const text = (content: string): ChunkLike => ({ choices: [{ delta: { content } }] });

test("accumulator rebuilds a plain text message and reports deltas", () => {
  const acc = new TurnAccumulator();
  assert.equal(acc.add(text("Hel")), "Hel");
  assert.equal(acc.add(text("lo")), "lo");
  assert.equal(acc.add({ choices: [{ delta: {} }] }), "");
  const message = acc.toMessage();
  assert.equal(message.content, "Hello");
  assert.equal(message.tool_calls, undefined);
});

test("accumulator reassembles tool calls whose arguments arrive in pieces", () => {
  const acc = new TurnAccumulator();
  acc.add({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "web_", arguments: "" } }] } }] });
  acc.add({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "search", arguments: "{\"q\":" } }] } }] });
  acc.add({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "\"cats\"}" } }, { index: 1, id: "call_b", function: { name: "fetch", arguments: "{}" } }] } }] });
  const message = acc.toMessage();
  assert.equal(message.content, null);
  assert.deepEqual(message.tool_calls, [
    { id: "call_a", type: "function", function: { name: "web_search", arguments: "{\"q\":\"cats\"}" } },
    { id: "call_b", type: "function", function: { name: "fetch", arguments: "{}" } }
  ]);
});

test("streamModelTurn forwards deltas as they arrive and returns the full message", async () => {
  const seen: string[] = [];
  const message = await streamModelTurn(async () => chunks([text("It is "), text("sunny."), text(" Bring shades.")]), {
    onTextDelta: (d) => seen.push(d)
  });
  assert.deepEqual(seen, ["It is ", "sunny.", " Bring shades."]);
  assert.equal(message.content, "It is sunny. Bring shades.");
});

test("streamModelTurn keeps a spoken preamble and the tool call from the same turn", async () => {
  const seen: string[] = [];
  const message = await streamModelTurn(async () => chunks([
    text("Let me check."),
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "calendar", arguments: "{}" } }] } }] }
  ]), { onTextDelta: (d) => seen.push(d) });
  assert.deepEqual(seen, ["Let me check."]);
  assert.equal(message.content, "Let me check.");
  assert.equal(message.tool_calls?.length, 1);
});

test("streamModelTurn stops when aborted", async () => {
  const controller = new AbortController();
  async function* slow(): AsyncGenerator<ChunkLike> {
    yield text("one");
    controller.abort();
    yield text("two");
  }
  await assert.rejects(
    streamModelTurn(async () => slow(), { signal: controller.signal }),
    (error: unknown) => error instanceof Error || error instanceof DOMException
  );
});

test("streamModelTurn fails a stalled stream instead of hanging the call", async () => {
  async function* stalled(): AsyncGenerator<ChunkLike> {
    yield text("start");
    await new Promise(() => undefined);
  }
  await assert.rejects(streamModelTurn(async () => stalled(), { stallMs: 30 }), /stalled/);
});
