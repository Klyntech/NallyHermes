export type ProgressEvent =
  | { type: "thinking"; phase: "model" | "between_tools" }
  | { type: "memory_start" }
  | { type: "memory_complete" }
  | { type: "memory_error" }
  | { type: "tool_start"; tool: string; args: Record<string, unknown> }
  | { type: "tool_complete"; tool: string }
  | { type: "tool_error"; tool: string }
  | { type: "response_ready" };

export interface ProgressDisplay {
  text: string;
  animateThinking?: boolean;
}

function short(value: unknown, max = 72): string {
  return typeof value === "string"
    ? value.replace(/\\s+/g, " ").trim().slice(0, max)
    : "";
}

function toolStatus(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "web_search":
      return short(args.query) ? `Searching ${short(args.query)}…` : "Searching the web…";
    case "fetch": {
      try {
        return `Reading ${new URL(String(args.url)).hostname}…`;
      } catch {
        return "Reading a webpage…";
      }
    }
    case "file_io": {
      const path = short(args.path, 90) || "workspace";
      const labels: Record<string, string> = {
        read: "Reading", write: "Writing", edit: "Editing", grep: "Searching",
        delete: "Deleting", list: "Listing", mkdir: "Creating folder"
      };
      return `${labels[String(args.operation)] ?? "Working on"} ${path}…`;
    }
    case "memory": {
      const labels: Record<string, string> = {
        recall: "Searching memory…", remember: "Saving memory…",
        update: "Updating memory…", forget: "Updating memory…"
      };
      return labels[String(args.operation)] ?? "Working with memory…";
    }
    case "schedule": {
      const labels: Record<string, string> = {
        create: "Setting up a reminder…", list: "Checking reminders…",
        cancel: "Updating a reminder…"
      };
      return labels[String(args.operation)] ?? "Checking schedules…";
    }
    default:
      return "Working…";
  }
}

export function displayProgress(event: ProgressEvent): ProgressDisplay | null {
  switch (event.type) {
    case "thinking":
      return { text: "Thinking…", animateThinking: true };
    case "memory_start":
      return { text: "Recalling relevant memory…" };
    case "memory_complete":
    case "memory_error":
    case "tool_complete":
      return { text: "Thinking…", animateThinking: true };
    case "tool_start":
      return { text: toolStatus(event.tool, event.args) };
    case "tool_error":
      return { text: "A tool encountered an issue. Continuing…" };
    case "response_ready":
      return null;
  }
}
