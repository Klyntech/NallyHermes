import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentBrain, ComputerRequest, ComputerResponse, SessionRecord, ToolDefinition, ToolResult } from "./types.js";
import { defaultPolicy, type ToolPolicy } from "./policy.js";
import { SessionStore } from "./sessions.js";
import { createTools } from "./tools.js";
import { Workspace } from "./workspace.js";

export class NallPuter {
  private readonly sessions: SessionStore;
  private readonly policy: ToolPolicy;
  private readonly workspacesRoot: string;

  constructor(private readonly dataRoot: string, private readonly brain: AgentBrain, policy = defaultPolicy()) {
    this.policy = policy;
    this.workspacesRoot = join(dataRoot, "workspaces");
    this.sessions = new SessionStore(join(dataRoot, "sessions"));
  }

  async initialize(): Promise<void> {
    await mkdir(this.dataRoot, { recursive: true, mode: 0o700 });
    await mkdir(this.workspacesRoot, { recursive: true, mode: 0o700 });
  }

  async handle(request: ComputerRequest): Promise<ComputerResponse> {
    const session = request.sessionId ? await this.sessions.load(request.sessionId) : await this.newSession();
    const workspace = new Workspace(session.workspace);
    const tools = createTools(workspace, this.policy);
    const brainResponse = await this.brain.respond({
      session,
      userMessage: request.message,
      tools: tools.map(({ name, description }) => ({ name, description }))
    });
    const toolResults = await this.executeCalls(brainResponse.toolCalls ?? [], tools, session);
    const updated = await this.sessions.recordEvent(session);
    return { session: updated, message: brainResponse.message, toolResults };
  }

  private async newSession(): Promise<SessionRecord> {
    const session = await this.sessions.create(join(this.workspacesRoot, randomUUID()));
    await new Workspace(session.workspace).initialize();
    return session;
  }

  /** Direct tool execution for tests and supervisors (still policy-gated). */
  async runTool(request: {
    sessionId?: string;
    name: import("./types.js").ToolName;
    input?: Record<string, unknown>;
  }): Promise<ComputerResponse> {
    const session = request.sessionId ? await this.sessions.load(request.sessionId) : await this.newSession();
    const workspace = new Workspace(session.workspace);
    const tools = createTools(workspace, this.policy);
    const toolResults = await this.executeCalls(
      [{ name: request.name, input: request.input ?? {} }],
      tools,
      session
    );
    const updated = await this.sessions.recordEvent(session);
    return {
      session: updated,
      message: toolResults[0]?.ok ? `Tool ${request.name} completed.` : `Tool ${request.name} failed.`,
      toolResults
    };
  }

  private async executeCalls(calls: NonNullable<Awaited<ReturnType<AgentBrain["respond"]>>["toolCalls"]>, tools: ToolDefinition[], session: SessionRecord): Promise<ToolResult[]> {
    const available = new Map(tools.map((tool) => [tool.name, tool]));
    const results: ToolResult[] = [];
    for (const call of calls.slice(0, 8)) {
      const tool = available.get(call.name);
      if (!tool) {
        results.push({ ok: false, error: `Unknown or unavailable tool: ${call.name}` });
        continue;
      }
      results.push(await tool.execute(call.input, { session, workspace: session.workspace }));
    }
    return results;
  }
}
