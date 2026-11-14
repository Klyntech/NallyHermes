import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolContext, ToolDefinition, ToolResult } from "./types.js";
import { Workspace } from "./workspace.js";
import { assertToolAllowed, type ToolPolicy } from "./policy.js";

const execFileAsync = promisify(execFile);

export function createTools(workspace: Workspace, policy: ToolPolicy): ToolDefinition[] {
  const definitions: ToolDefinition[] = [
    {
      name: "list_files",
      description: "List files and directories within the current session workspace.",
      execute: async (input) => run("list_files", policy, async () => ({ ok: true, output: await workspace.list(stringInput(input, "path", ".")) }))
    },
    {
      name: "read_file",
      description: "Read a UTF-8 text file within the current session workspace.",
      execute: async (input) => run("read_file", policy, async () => ({ ok: true, output: await workspace.read(stringInput(input, "path")) }))
    },
    {
      name: "write_file",
      description: "Write a bounded UTF-8 text file within the current session workspace.",
      execute: async (input) => run("write_file", policy, async () => {
        await workspace.write(stringInput(input, "path"), stringInput(input, "content"));
        return { ok: true, output: { written: true } };
      })
    },
    {
      name: "run_command",
      description: "Run one bounded command in the session workspace. Disabled unless NALLPUTER_ENABLE_SHELL=true.",
      execute: async (input, context) => run("run_command", policy, async () => {
        const command = stringInput(input, "command");
        const result = await execFileAsync("/bin/bash", ["-lc", command], {
          cwd: context.workspace,
          timeout: policy.shellTimeoutMs,
          maxBuffer: policy.maxCommandOutputBytes,
          windowsHide: true
        });
        return { ok: true, output: { stdout: result.stdout, stderr: result.stderr } };
      })
    }
  ];
  return definitions;
}

async function run(name: ToolDefinition["name"], policy: ToolPolicy, operation: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    assertToolAllowed(policy, name);
    return await operation();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function stringInput(input: Record<string, unknown>, key: string, fallback?: string): string {
  const value = input[key] ?? fallback;
  if (typeof value !== "string" || !value.trim()) throw new Error(`Tool input '${key}' must be a non-empty string.`);
  return value;
}
