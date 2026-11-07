export type ToolProgressEvent =
  | { type: "tool_progress"; tool: "web_search"; stage: "search_complete"; resultCount: number }
  | { type: "tool_progress"; tool: "fetch"; stage: "fetch_redirect" | "fetch_reading" }
  | { type: "tool_progress"; tool: "file_io"; stage: "file_processing"; operation: string; path: string }
  | { type: "tool_progress"; tool: "memory"; stage: "memory_indexing" | "memory_retrieving" }
  | { type: "tool_progress"; tool: "schedule"; stage: "schedule_saving" };

export type ToolProgressReporter = (event: ToolProgressEvent) => Promise<void> | void;

export type ProgressEvent =
  | { type: "thinking"; phase: "model" | "between_tools" }
  | { type: "planning" }
  | { type: "plan_created"; stepCount: number }
  | { type: "plan_step_start"; index: number; total: number; task: string }
  | { type: "plan_step_complete"; index: number; total: number }
  | { type: "plan_step_failed"; index: number; total: number }
  | { type: "recovery_retry"; tool: string; attempt: number; maxAttempts: number }
  | { type: "recovery_adjusting" }
  | { type: "verifying" }
  | { type: "information_sufficient" }
  | { type: "memory_start" }
  | { type: "memory_complete" }
  | { type: "memory_error" }
  | { type: "tool_start"; tool: string; toolCallId?: string; args: Record<string, unknown> }
  | ToolProgressEvent
  | { type: "tool_complete"; tool: string; toolCallId?: string }
  | { type: "tool_error"; tool: string; toolCallId?: string }
  | { type: "response_ready" };

export interface OrchestraEvent {
  requestId: string;
  sequence: number;
  emittedAt: string;
  event: ProgressEvent;
  correlation: {
    stepIndex?: number;
    toolName?: string;
    toolCallId?: string;
  };
}

export interface ProgressDisplay {
  text: string;
  animateThinking?: boolean;
}

function short(value: unknown, max = 72): string {
  return typeof value === "string"
    ? value.replaceAll("\n", " ").replaceAll("\r", " ").replaceAll("\t", " ").trim().slice(0, max)
    : "";
}

function toolStatus(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "web_search":
      return "Searching the web…";
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
    case "planning":
      return { text: "Planning the task…" };
    case "plan_created":
      return { text: `Plan ready: ${event.stepCount} steps…` };
    case "plan_step_start":
      return { text: `Step ${event.index}/${event.total}: ${short(event.task, 65)}…` };
    case "plan_step_complete":
      return { text: `Completed step ${event.index}/${event.total}…` };
    case "plan_step_failed":
      return { text: `Step ${event.index}/${event.total} could not be completed…` };
    case "recovery_retry":
      return { text: `Retrying ${event.tool} (${event.attempt}/${event.maxAttempts})…` };
    case "recovery_adjusting":
      return { text: "Adjusting the approach…" };
    case "verifying":
      return { text: "Verifying the collected results…" };
    case "information_sufficient":
      return { text: "Enough information collected. Preparing the answer…" };
    case "memory_start":
      return { text: "Recalling relevant memory…" };
    case "memory_complete":
    case "memory_error":
    case "tool_complete":
      return { text: "Thinking…", animateThinking: true };
    case "tool_start":
      return { text: toolStatus(event.tool, event.args) };
    case "tool_progress":
      switch (event.tool) {
        case "web_search":
          return { text: `Found ${event.resultCount} search results…` };
        case "fetch":
          return { text: event.stage === "fetch_redirect" ? "Following webpage redirect…" : "Reading webpage content…" };
        case "file_io": {
          const labels: Record<string, string> = {
            read: "Opening", write: "Writing", edit: "Applying changes to",
            grep: "Searching", delete: "Removing", list: "Listing", mkdir: "Creating"
          };
          return { text: `${labels[event.operation] ?? "Working on"} ${short(event.path, 90)}…` };
        }
        case "memory":
          return { text: event.stage === "memory_indexing" ? "Adding memory to semantic search…" : "Searching related memories…" };
        case "schedule":
          return { text: "Saving reminder details…" };
        default:
          return { text: "Working…" };
      }
    case "tool_error":
      return { text: "A tool encountered an issue. Adjusting…"};
    case "response_ready":
      return null;
  }
}
