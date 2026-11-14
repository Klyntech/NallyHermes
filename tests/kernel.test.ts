import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NallPuter } from "../src/kernel/computer.js";
import { DevelopmentBrain } from "../src/kernel/brain.js";
import { defaultPolicy } from "../src/kernel/policy.js";
import { createTools } from "../src/kernel/tools.js";
import { Workspace } from "../src/kernel/workspace.js";

test("workspace rejects traversal and supports bounded files", async () => {
  const root = await mkdtemp(join(tmpdir(), "nallputer-workspace-"));
  try {
    const workspace = new Workspace(root);
    await workspace.initialize();
    await workspace.write("notes/hello.txt", "hello");
    assert.equal(await workspace.read("notes/hello.txt"), "hello");
    assert.throws(() => workspace.resolveSafe("../escape"), /escapes/);
    await assert.rejects(() => workspace.read("../escape"), /escapes/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("shell is denied by the default policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "nallputer-policy-"));
  try {
    const workspace = new Workspace(root);
    await workspace.initialize();
    const shell = createTools(workspace, defaultPolicy()).find((tool) => tool.name === "run_command");
    assert.ok(shell);
    const result = await shell.execute({ command: "printf unsafe" }, { session: { id: "test", createdAt: "", updatedAt: "", workspace: root, events: 0 }, workspace: root });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /not allowed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("computer creates a durable session and returns a brain response", async () => {
  const root = await mkdtemp(join(tmpdir(), "nallputer-computer-"));
  try {
    const computer = new NallPuter(root, new DevelopmentBrain());
    await computer.initialize();
    const response = await computer.handle({ message: "hello NallPuter" });
    assert.ok(response.session.id);
    assert.equal(response.session.events, 1);
    assert.match(response.message, /development kernel received/);
    const followUp = await computer.handle({ sessionId: response.session.id, message: "continue" });
    assert.equal(followUp.session.events, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
