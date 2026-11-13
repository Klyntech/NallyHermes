import type { ChatCompletionTool } from "openai/resources/index.js";
import { academicAgentTool } from "./academicToolDef.js";

export { SYSTEM_PROMPT } from "./systemPrompt.js";

export const agentTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Discover current or time-sensitive information and find relevant public sources. Use for broad discovery; use fetch only when a particular result needs deeper inspection.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "A focused search query." },
          max_results: { type: "integer", minimum: 1, maximum: 10, description: "Number of results (default 5)." }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch",
      description: "Read a specific public HTTP(S) webpage or text resource when its contents are needed. Usually use a URL discovered through web_search; does not access private networks or binary files.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "Public HTTP(S) URL to retrieve." } },
        required: ["url"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "file_io",
      description: "Manage files inside the current Telegram user's isolated workspace. Use read/list/grep to inspect; use write/edit/delete/mkdir only when the user has clearly requested the change and required confirmation has been obtained.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["read", "write", "edit", "grep", "delete", "list", "mkdir"] },
          path: { type: "string", description: "Relative path inside your workspace." },
          content: { type: "string", description: "Content for write, or replacement text for edit." },
          search: { type: "string", description: "Literal text to find for edit or grep." },
          replace: { type: "string", description: "Replacement text for edit." }
        },
        required: ["operation", "path"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "memory",
      description: "Dynamically retrieve relevant past context or manage durable memories for the current Telegram user. Choose recall only when it materially helps the current task; use a focused query. Recall is read-only; remember/update/forget change stored data and must follow memory consent and confirmation rules.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["recall", "remember", "forget", "update"] },
          content: { type: "string", description: "Memory text for remember or update." },
          id: { type: "string", description: "Memory ID for update or forget." },
          query: { type: "string", description: "Focused text query for recall." },
          kind: { type: "string", enum: ["fact", "preference", "project", "commitment", "entity", "episode"] },
          subject: { type: "string", description: "Entity or subject of a durable memory." },
          predicate: { type: "string", description: "Relation, such as favorite_club or studies." },
          object: { type: "string", description: "Value of the relation, such as Real Madrid." },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          expires_at: { type: "string", description: "Optional ISO-8601 expiry for time-bound context." }
        },
        required: ["operation"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "schedule",
      description: "List reminders, create a one-time or recurring reminder, or cancel one. Use only when the user gives a known clock time. Requests such as 'when the match starts', 'keep checking', or 'update me every 30 minutes' require a condition-monitoring workflow or a clarification; never turn them into a guessed fixed-time reminder. Listing is read-only; creation and cancellation change schedule state. Due reminders are proactively delivered by Telegram.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["create", "list", "cancel"] },
          task: { type: "string", description: "Reminder text." },
          run_at: { type: "string", description: "First future ISO-8601 date/time including timezone offset." },
          recurrence: { type: "string", enum: ["daily", "weekly", "monthly"], description: "Optional recurrence pattern." },
          timezone: { type: "string", description: "Optional IANA timezone override; defaults to the user's saved timezone, e.g. Africa/Lagos." },
          id: { type: "string", description: "Reminder ID for cancellation." }
        },
        required: ["operation"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "workflow",
      description: "Create and manage bounded recurring workflows. Workflows record run history and proactively deliver reports to Telegram. Use this for recurring multi-step work, source checks, and condition monitoring when the supported trigger and tools exist; do not downgrade an event-triggered request into a plain reminder.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["create", "list", "pause", "cancel"] },
          name: { type: "string", description: "Short workflow name." },
          instructions: { type: "string", description: "Exact recurring instructions." },
          run_at: { type: "string", description: "First run as ISO-8601 with explicit timezone." },
          recurrence: { type: "string", enum: ["daily", "weekly", "monthly"] },
          timezone: { type: "string", description: "IANA timezone for recurring wall-clock behavior." },
          allowed_tools: { type: "array", items: { type: "string", enum: ["web_search", "fetch", "memory", "academic", "file_io", "schedule", "calendar", "github", "notion", "gmail", "nallputer"] }, maxItems: 10 },
          approval_policy: { type: "string", description: "Policy label such as confirm_mutations or read_only." },
          output_destination: { type: "string", enum: ["telegram"] },
          id: { type: "string", description: "Workflow ID for pause or cancel." }
        },
        required: ["operation"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calendar",
      description: "Use the connected calendar when configured. List events or create, update, and cancel events. Reads are safe; mutations require the applicable approval policy and must never be claimed complete without provider confirmation.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["list", "create", "update", "cancel"] },
          from: { type: "string", description: "ISO-8601 start of the range for listing events." },
          to: { type: "string", description: "ISO-8601 end of the range for listing events." },
          title: { type: "string", description: "Event title." },
          start: { type: "string", description: "ISO-8601 event start." },
          end: { type: "string", description: "ISO-8601 event end." },
          timezone: { type: "string", description: "IANA timezone for the event." },
          description: { type: "string" },
          location: { type: "string" },
          attendees: { type: "array", items: { type: "string" }, maxItems: 50 },
          calendar_id: { type: "string" },
          event_id: { type: "string" }
        },
        required: ["operation"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "github",
      description: "Use Nally's token-authenticated GitHub connector through one dispatcher. Use list_operations to discover supported operations, get_operation to inspect one schema, and call_operation to execute it. GitHub access is fail-closed to configured repositories; read operations are allowed when configured, while writes require explicit approval and are never replayed automatically.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["list_operations", "get_operation", "call_operation"] },
          name: { type: "string", description: "GitHub operation name for get_operation or call_operation." },
          arguments: { type: "object", description: "Arguments matching the selected GitHub operation schema." },
          approved: { type: "boolean", description: "Explicit approval for the requested GitHub write operation." }
        },
        required: ["operation"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "notion",
      description: "Use Nally's token-authenticated Notion connector through one dispatcher. Discover operations before use; reads are fail-closed when unconfigured and writes require the provider gate plus explicit approval.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["list_operations", "get_operation", "call_operation"] },
          name: { type: "string", maxLength: 100 },
          arguments: { type: "object" },
          approved: { type: "boolean" }
        },
        required: ["operation"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "gmail",
      description: "Use Nally's OAuth-backed Gmail connector through one dispatcher. Search and read are bounded; drafts and sending require the provider gate plus explicit approval.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["list_operations", "get_operation", "call_operation"] },
          name: { type: "string", maxLength: 100 },
          arguments: { type: "object" },
          approved: { type: "boolean" }
        },
        required: ["operation"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "nallputer",
      description: "Use the bounded Nallputer VM connector through one dispatcher. Host access, commands, files, services, and logs are scoped by explicit workspace, timeout, output, network, and approval policy.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["list_operations", "get_operation", "call_operation"] },
          name: { type: "string", maxLength: 100 },
          arguments: { type: "object" },
          approved: { type: "boolean" }
        },
        required: ["operation"],
        additionalProperties: false
      }
    }
  },
  academicAgentTool
];
