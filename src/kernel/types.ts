export type SessionId = string;

export type SessionRecord = {
  id: SessionId;
  createdAt: string;
  updatedAt: string;
  workspace: string;
  events: number;
};

export type ToolName = "list_files" | "read_file" | "write_file" | "run_command";

export type ToolCall = {
  name: ToolName;
  input: Record<string, unknown>;
};

export type ToolResult = {
  ok: boolean;
  output?: unknown;
  error?: string;
};

export type ToolContext = {
  session: SessionRecord;
  workspace: string;
};

export type ToolDefinition = {
  name: ToolName;
  description: string;
  execute: (input: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
};

export type BrainRequest = {
  session: SessionRecord;
  userMessage: string;
  tools: Pick<ToolDefinition, "name" | "description">[];
};

export type BrainResponse = {
  message: string;
  toolCalls?: ToolCall[];
};

export interface AgentBrain {
  respond(request: BrainRequest): Promise<BrainResponse>;
}

export type ComputerRequest = {
  sessionId?: string;
  message: string;
};

export type ComputerResponse = {
  session: SessionRecord;
  message: string;
  toolResults: ToolResult[];
};
