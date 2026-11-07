import assert from "node:assert/strict";
import test from "node:test";
import { ToolEvidenceCache } from "../src/agent/toolEvidenceCache.js";
import type { ToolCallInput } from "../src/agent/executor.js";

const call = (id: string, name: string, args: Record<string, unknown>): ToolCallInput => ({
  id, type: "function", function: { name, arguments: JSON.stringify(args) }
});

test("reuses successful equivalent web searches across turns", async () => {
  const cache = new ToolEvidenceCache();
  let executions = 0;
  const first = call("one", "web_search", { query: "LightRAG official documentation site and GitHub repository", max_results: 8 });
  const second = call("two", "web_search", { query: "LightRAG documentation GitHub repository official", max_results: 8 });
  const a = await cache.execute([first], async (calls) => {
    executions += calls.length;
    return [{ role: "tool", tool_call_id: calls[0]!.id, content: JSON.stringify({ results: ["official docs"] }) }];
  });
  const b = await cache.execute([second], async (calls) => {
    executions += calls.length;
    return [];
  });
  assert.equal(executions, 1);
  assert.equal(a.executedCount, 1);
  assert.equal(b.reusedCount, 1);
  assert.equal(JSON.parse(String(b.results[0]!.content))._reused_read_result_from, "one");
});

test("does not cache failed reads or mutations", async () => {
  const cache = new ToolEvidenceCache();
  const failed = call("bad", "web_search", { query: "LightRAG official storage docs", max_results: 8 });
  const write = call("write", "file_io", { operation: "write", path: "notes.txt", content: "x" });
  let executions = 0;
  await cache.execute([failed], async (calls) => {
    executions += calls.length;
    return [{ role: "tool", tool_call_id: calls[0]!.id, content: JSON.stringify({ error: "temporary failure" }) }];
  });
  await cache.execute([failed], async (calls) => {
    executions += calls.length;
    return [{ role: "tool", tool_call_id: calls[0]!.id, content: JSON.stringify({ results: [] }) }];
  });
  const mutation = await cache.execute([write], async (calls) => {
    executions += calls.length;
    return [{ role: "tool", tool_call_id: calls[0]!.id, content: JSON.stringify({ ok: true }) }];
  });
  assert.equal(executions, 3);
  assert.equal(mutation.reusedCount, 0);
});

test("deduplicates equivalent calls within one model tool batch", async () => {
  const cache = new ToolEvidenceCache();
  const calls = [
    call("one", "fetch", { url: "https://example.com/docs#intro" }),
    call("two", "fetch", { url: "https://example.com/docs" })
  ];
  let executions = 0;
  const result = await cache.execute(calls, async (unique) => {
    executions += unique.length;
    return [{ role: "tool", tool_call_id: unique[0]!.id, content: JSON.stringify({ page: "docs" }) }];
  });
  assert.equal(executions, 1);
  assert.equal(result.results.length, 2);
  assert.equal(result.reusedCount, 1);
});
