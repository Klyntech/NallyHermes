import assert from "node:assert/strict";
import test from "node:test";
import { createEventPublisher } from "../src/agent/eventStream.js";
import type { OrchestraEvent } from "../src/agent/progress.js";

test("publishes correlated events in invocation order with contiguous sequence numbers", async () => {
  const received: Array<{ requestId: string; sequence: number; event: string }> = [];
  const emit = createEventPublisher({
    requestId: "request-123",
    onEvent: (item) => {
      received.push({
        requestId: item.requestId,
        sequence: item.sequence,
        event: item.event.type
      });
    },
    now: () => "2026-11-07T00:00:00.000Z"
  });

  await Promise.all([
    emit({ type: "planning" }),
    emit({ type: "plan_step_start", index: 2, total: 3, task: "Inspect" }),
    emit({ type: "tool_start", tool: "fetch", toolCallId: "call-9", args: { url: "https://example.com" } })
  ]);

  assert.deepEqual(received, [
    { requestId: "request-123", sequence: 1, event: "planning" },
    { requestId: "request-123", sequence: 2, event: "plan_step_start" },
    { requestId: "request-123", sequence: 3, event: "tool_start" }
  ]);
});

test("preserves legacy progress delivery and attaches step/tool correlation", async () => {
  const legacy: string[] = [];
  const structured: Array<{ correlation: OrchestraEvent["correlation"]; sequence: number }> = [];
  const emit = createEventPublisher({
    requestId: "r-2",
    onProgress: (event) => { legacy.push(event.type); },
    onEvent: (event) => {
      structured.push({ correlation: event.correlation, sequence: event.sequence });
    }
  });

  await emit({ type: "plan_step_start", index: 4, total: 4, task: "Finish" });
  await emit({ type: "tool_complete", tool: "web_search", toolCallId: "tool-4" });

  assert.deepEqual(legacy, ["plan_step_start", "tool_complete"]);
  assert.deepEqual(structured, [
    { correlation: { stepIndex: 4 }, sequence: 1 },
    { correlation: { toolName: "web_search", toolCallId: "tool-4" }, sequence: 2 }
  ]);
});
