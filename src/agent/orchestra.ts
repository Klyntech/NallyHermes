import { randomUUID } from "node:crypto";

export type InteractionChannel = "telegram" | "voice" | "api";
export type ExecutionMode = "adaptive" | "workflow";
export type ExecutionStatus = "created" | "running" | "waiting_for_tool" | "completed" | "partial" | "failed";

export interface OrchestraRequest {
  text: string;
  telegramId: string;
  conversationId?: string;
  channel?: InteractionChannel;
  responseStyle?: "text" | "spoken";
}

export interface ExecutionBudget {
  deadlineAt: number;
  maxModelRounds: number;
  maxToolRounds: number;
  maxParallelCalls: number;
}

export interface ExecutionState {
  requestId: string;
  conversationId?: string;
  telegramId: string;
  channel: InteractionChannel;
  mode: ExecutionMode;
  status: ExecutionStatus;
  startedAt: number;
  phases: Record<string, { startedAt: number; finishedAt?: number; durationMs?: number }>;
  toolCalls: number;
  failures: number;
  budget: ExecutionBudget;
}

export interface RouteDecision {
  mode: ExecutionMode;
  reason: string;
  usePlanner: boolean;
}

export function routeRequest(text: string): RouteDecision {
  return {
    mode: "adaptive",
    reason: text.trim() ? "model-led capability selection" : "empty request handled by the model",
    usePlanner: false
  };
}

export function createExecutionState(input: OrchestraRequest, route: RouteDecision, budget: Omit<ExecutionBudget, "deadlineAt"> & { deadlineAt?: number }): ExecutionState {
  return {
    requestId: randomUUID(),
    conversationId: input.conversationId,
    telegramId: input.telegramId,
    channel: input.channel ?? "telegram",
    mode: route.mode,
    status: "created",
    startedAt: Date.now(),
    phases: {},
    toolCalls: 0,
    failures: 0,
    budget: { ...budget, deadlineAt: budget.deadlineAt ?? Date.now() + 120_000 }
  };
}

export function beginPhase(state: ExecutionState, name: string): void {
  state.phases[name] = { startedAt: Date.now() };
}

export function endPhase(state: ExecutionState, name: string): number {
  const phase = state.phases[name];
  if (!phase) return 0;
  phase.finishedAt = Date.now();
  phase.durationMs = phase.finishedAt - phase.startedAt;
  return phase.durationMs;
}

export function completeExecution(state: ExecutionState, status: Exclude<ExecutionStatus, "created" | "running" | "waiting_for_tool">): void {
  state.status = status;
}

export function summarizeExecution(state: ExecutionState): Record<string, unknown> {
  const totalMs = Date.now() - state.startedAt;
  return {
    request_id: state.requestId,
    mode: state.mode,
    channel: state.channel,
    status: state.status,
    total_ms: totalMs,
    phases: Object.fromEntries(Object.entries(state.phases).map(([name, phase]) => [name, phase.durationMs ?? Date.now() - phase.startedAt])),
    tool_calls: state.toolCalls,
    failures: state.failures
  };
}

export interface VoiceRequest {
  transcript: string;
  telegramId: string;
  conversationId?: string;
}

export interface VoiceResponse {
  text: string;
  speak: boolean;
  interruptible: boolean;
}

export function toVoiceResponse(text: string): VoiceResponse {
  return { text, speak: true, interruptible: true };
}
