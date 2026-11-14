import type { ToolName } from "./types.js";

export type ToolPolicy = {
  allowedTools: ReadonlySet<ToolName>;
  shellTimeoutMs: number;
  maxCommandOutputBytes: number;
};

export function defaultPolicy(environment = process.env): ToolPolicy {
  const allowed = new Set<ToolName>(["list_files", "read_file", "write_file"]);
  if (environment.NALLPUTER_ENABLE_SHELL === "true") allowed.add("run_command");
  return {
    allowedTools: allowed,
    shellTimeoutMs: 10_000,
    maxCommandOutputBytes: 200_000
  };
}

export function assertToolAllowed(policy: ToolPolicy, name: ToolName): void {
  if (!policy.allowedTools.has(name)) throw new Error(`Tool is not allowed by the active policy: ${name}`);
}
