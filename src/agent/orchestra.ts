import { randomUUID } from "node:crypto";

export type InteractionChannel = "telegram" | "voice" | "api";
export type ExecutionMode = "conversation" | "direct" | "single_action" | "planned" | "workflow" | "monitoring";
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

const FOLLOW_UP = /^(confirm(?:\s+time)?|yes|yeah|yep|no|nope|do\s+that|update\s+me|cancel\s+(?:it|that)|the\s+score)$/i;
const EVENT_TRIGGER = /\b(when|once|as soon as|if|keep checking|until)\b.*\b(starts?|begins?|goes live|happens?|changes?|ends?|finishes?)\b/i;
const REPEATING_UPDATE = /\b(?:every|each)\s+\d+\s*(?:min|mins|minutes|hour|hours)\b/i;
const MULTI_STEP = /\b(and then|then|after that|also|compare|summari[sz]e|research|investigate|review .* and)\b/i;
const ACTION = /\b(remind|schedule|remember|forget|cancel|create|update|delete|send|message|set)\b/i;

export function routeRequest(text: string): RouteDecision {
  const value = text.trim();
  if (!value) return { mode: "conversation", reason: "empty conversational input", usePlanner: false };
  if (FOLLOW_UP.test(value)) return { mode: "direct", reason: "short contextual follow-up", usePlanner: false };
  if (EVENT_TRIGGER.test(value) || REPEATING_UPDATE.test(value)) {
    return { mode: "monitoring", reason: "condition or repeated-update request", usePlanner: true };
  }
  if (MULTI_STEP.test(value)) return { mode: "planned", reason: "multiple steps likely required", usePlanner: true };
  if (ACTION.test(value)) return { mode: "single_action", reason: "single action or tool request", usePlanner: false };
  return { mode: "conversation", reason: "ordinary conversation or answer", usePlanner: false };
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
