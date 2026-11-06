import { mkdir, readdir, readFile, writeFile, rm, stat, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "../../config.js";
import { toolRegistry } from "./registry.js";

const schema = z.object({
  operation: z.enum(["read", "write", "edit", "grep", "delete", "list", "mkdir"]),
  path: z.string().min(1).max(500),
  content: z.string().max(1_000_000).optional(),
  search: z.string().max(500).optional(),
  replace: z.string().max(5000).optional(),
  recursive: z.boolean().default(false)
});
async function safePath(input: string, userId: string): Promise<string> {
  if (path.isAbsolute(input)) throw new Error("Absolute paths are not allowed.");
  const configuredRoot = path.resolve(config.FILE_WORKSPACE, userId);
  await mkdir(configuredRoot, { recursive: true });
  const root = await realpath(configuredRoot);
  const target = path.resolve(root, input);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("Path escapes the user's workspace.");
  let cursor = root;
  for (const segment of path.relative(root, target).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error("Symbolic links are not allowed in the workspace.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  return target;
}
toolRegistry.register({
  name: "file_io",
  description: "Manage files inside the user's isolated workspace. Operations: read, write, edit, grep, delete, list, mkdir.",
  schema,
  parameters: { type: "object", properties: {
    operation: { type: "string", enum: ["read","write","edit","grep","delete","list","mkdir"] },
    path: { type: "string", description: "Workspace-relative path" },
    content: { type: "string", description: "Content for write" },
    search: { type: "string", description: "Literal text to find for edit or grep" },
    replace: { type: "string", description: "Replacement text for edit" },
    recursive: { type: "boolean", default: false }
  }, required: ["operation","path"], additionalProperties: false },
  async execute(input, context) {
    const target = await safePath(input.path, context.userId);
    switch (input.operation) {
      case "read": {
        const info = await stat(target); if (!info.isFile()) throw new Error("Path is not a file.");
        return { path: input.path, content: await readFile(target, "utf8") };
      }
      case "write": {
        if (input.content === undefined) throw new Error("content is required for write.");
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, input.content, { encoding: "utf8", flag: "w" });
        return { path: input.path, bytes: Buffer.byteLength(input.content), written: true };
      }
      case "edit": {
        if (input.search === undefined || input.replace === undefined) throw new Error("search and replace are required for edit.");
        const original = await readFile(target, "utf8");
        if (!original.includes(input.search)) throw new Error("Search text was not found.");
        await writeFile(target, original.replace(input.search, input.replace), "utf8");
        return { path: input.path, edited: true };
      }
      case "grep": {
        if (!input.search) throw new Error("search is required for grep.");
        const text = await readFile(target, "utf8");
        return { path: input.path, matches: text.split("\n").flatMap((line, i) => line.includes(input.search!) ? [{ line: i + 1, text: line }] : []) };
      }
      case "delete": {
        await rm(target, { recursive: input.recursive, force: false });
        return { path: input.path, deleted: true };
      }
      case "list": {
        const entries = await readdir(target, { withFileTypes: true });
        return entries.map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" }));
      }
      case "mkdir": {
        await mkdir(target, { recursive: true });
        return { path: input.path, created: true };
      }
    }
  }
});
