import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const workspace = await mkdtemp(path.join(os.tmpdir(), "nally-workspace-test-"));
process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nvidia-key";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
process.env.WEBHOOK_URL = "https://example.test";
process.env.WEBHOOK_SECRET = "a".repeat(32);
process.env.FILE_WORKSPACE = workspace;
process.env.LIGHTRAG_ENABLED = "false";

const { fileIO } = await import("../src/agent/tools/extended.js");

after(async () => {
  await rm(workspace, { recursive: true, force: true });
});

test("writes and reads files inside the user's workspace", async () => {
  await fileIO("12345", { operation: "write", path: "notes/today.txt", content: "Nally workspace test" });
  const result = await fileIO("12345", { operation: "read", path: "notes/today.txt" }) as { content: string };
  assert.equal(result.content, "Nally workspace test");
});

test("rejects paths that escape the user's workspace", async () => {
  await assert.rejects(
    fileIO("12345", { operation: "write", path: "../outside.txt", content: "not allowed" }),
    /outside your workspace/
  );
});

test("rejects symbolic links that point outside the user's workspace", async () => {
  const userRoot = path.join(workspace, "12345");
  const external = await mkdtemp(path.join(os.tmpdir(), "nally-external-test-"));
  try {
    await mkdir(userRoot, { recursive: true });
    await symlink(external, path.join(userRoot, "external"));
    await assert.rejects(
      fileIO("12345", { operation: "write", path: "external/escape.txt", content: "not allowed" }),
      /Symbolic links are not allowed/
    );
    await assert.rejects(readFile(path.join(external, "escape.txt"), "utf8"));
  } finally {
    await rm(external, { recursive: true, force: true });
  }
});
