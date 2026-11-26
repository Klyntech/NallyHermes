import assert from "node:assert/strict";
import test from "node:test";

const {
  isWriteOperation,
  approvalOperation,
  approvalScope,
  summarizeWriteRequest,
  isPendingExpired,
  PENDING_APPROVAL_TTL_MS
} = await import("../src/agent/approvals.js");

test("detects file and memory writes", () => {
  assert.equal(isWriteOperation("file_io", { operation: "write" }), true);
  assert.equal(isWriteOperation("file_io", { operation: "read" }), false);
  assert.equal(isWriteOperation("memory", { operation: "remember" }), true);
  assert.equal(isWriteOperation("memory", { operation: "recall" }), false);
});

test("github list_operations is not a write", () => {
  assert.equal(isWriteOperation("github", { operation: "list_operations" }), false);
});

test("approval scope and operation helpers", () => {
  assert.equal(approvalScope("github", "create_issue"), "github:create_issue");
  assert.equal(approvalOperation("file_io", { operation: "delete" }), "delete");
});

test("summarize includes repo and path when present", () => {
  const s = summarizeWriteRequest("github", "create_issue", {
    arguments: { owner: "Klyntech", repo: "NallyHermes", title: "Bug" }
  });
  assert.match(s, /github\.create_issue/);
  assert.match(s, /NallyHermes|repo=/);
});

test("pending approvals expire after TTL", () => {
  const fresh = { status: "pending", createdAt: new Date().toISOString() };
  assert.equal(isPendingExpired(fresh), false);
  const old = { status: "pending", createdAt: new Date(Date.now() - PENDING_APPROVAL_TTL_MS - 1000).toISOString() };
  assert.equal(isPendingExpired(old), true);
  assert.equal(isPendingExpired({ status: "approved", createdAt: old.createdAt }), false);
});
