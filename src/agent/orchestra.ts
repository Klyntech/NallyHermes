import { randomUUID } from "node:crypto";

export type InteractionChannel = "telegram" | "voice" | "api";
export type ExecutionMode = "adaptive" | "workflow";
export type ExecutionStatus = "created" | "running" | "waiting_for_tool" | "completed" | "partial" | "failed";
export type ResponseStyle = "text" | "spoken";
export type RouteComplexity = "simple" | "standard" | "complex";

export interface OrchestraRequest {
  text: string;
  telegramId: string;
  conversationId?: string;
  channel?: InteractionChannel;
  responseStyle?: ResponseStyle;
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
  responseStyle: ResponseStyle;
  mode: ExecutionMode;
  status: ExecutionStatus;
  startedAt: number;
  phases: Record<string, { startedAt: number; finishedAt?: number; durationMs?: number }>;
  toolCalls: number;
  failures: number;
  budget: ExecutionBudget;
  routeReason?: string;
  complexity?: RouteComplexity;
}

export interface RouteDecision {
  mode: ExecutionMode;
  reason: string;
  /** When true, the controller may call the smart planner before the tool loop. */
  usePlanner: boolean;
  complexity: RouteComplexity;
}

export interface RouteOptions {
  channel?: InteractionChannel;
  responseStyle?: ResponseStyle;
}

/**
 * Cheap routing for cost control — not intent authority.
 * The model still chooses tools and capability; this only decides whether
 * explicit multi-step planning is worth the extra model call.
 */
export function routeRequest(text: string, options?: RouteOptions): RouteDecision {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      mode: "adaptive",
      reason: "empty request handled by the model",
      usePlanner: false,
      complexity: "simple"
    };
  }

  const complexity = estimateComplexity(trimmed);
  // Voice turns prefer a direct loop unless the transcript is clearly multi-step;
  // planning latency hurts spoken UX more than text.
  const voiceBias = (options?.channel === "voice" || options?.responseStyle === "spoken") && complexity !== "complex";

  if (complexity === "complex" && !voiceBias) {
    return {
      mode: "adaptive",
      reason: "multi-step or comparative ask; planner may decompose",
      usePlanner: true,
      complexity
    };
  }

  if (complexity === "standard") {
    return {
      mode: "adaptive",
      reason: "standard ask; direct adaptive loop",
      usePlanner: false,
      complexity
    };
  }

  return {
    mode: "adaptive",
    reason: voiceBias
      ? "spoken/simple path; skip planner for lower latency"
      : "simple ask; direct adaptive loop",
    usePlanner: false,
    complexity
  };
}

/**
 * Heuristics only for budget shaping. They must not invent domain intent
 * (e.g. treating "when the match starts" as a workflow by keyword alone).
 */
export function estimateComplexity(text: string): RouteComplexity {
  const trimmed = text.trim();
  const length = trimmed.length;
  const lower = trimmed.toLowerCase();

  // Short social / single-shot replies stay simple.
  if (length <= 48 && !/[?\n]/.test(trimmed)) {
    return "simple";
  }

  const sentenceBreaks = (trimmed.match(/[.!?](?:\s|$)/g) ?? []).length;
  const lineBreaks = (trimmed.match(/\n/g) ?? []).length;
  const numbered = /^\s*\d+[\).:-]/m.test(trimmed) || /(?:^|\n)\s*[-*]\s+\S+/m.test(trimmed);

  // Explicit multi-part structure without claiming what the parts mean.
  const multiPart =
    sentenceBreaks >= 2 ||
    lineBreaks >= 2 ||
    numbered ||
    /\b(?:then|after that|next|also|additionally|finally)\b/i.test(trimmed);

  const comparative =
    /\b(?:compare|versus|vs\.?|difference between|pros and cons)\b/i.test(lower);

  const multiQuestion = (trimmed.match(/\?/g) ?? []).length >= 2;

  if ((multiPart && length >= 100) || comparative || multiQuestion || (numbered && length >= 60)) {
    return "complex";
  }

  if (length >= 220 || sentenceBreaks >= 1 && length >= 120 || multiPart) {
    return "standard";
  }

  return length <= 80 ? "simple" : "standard";
}

/** Resolve response style from explicit option or channel default. */
export function resolveResponseStyle(
  channel: InteractionChannel | undefined,
  responseStyle?: ResponseStyle
): ResponseStyle {
  if (responseStyle) return responseStyle;
  return channel === "voice" ? "spoken" : "text";
}

export function createExecutionState(
  input: OrchestraRequest,
  route: RouteDecision,
  budget: Omit<ExecutionBudget, "deadlineAt"> & { deadlineAt?: number }
): ExecutionState {
  const channel = input.channel ?? "telegram";
  return {
    requestId: randomUUID(),
    conversationId: input.conversationId,
    telegramId: input.telegramId,
    channel,
    responseStyle: resolveResponseStyle(channel, input.responseStyle),
    mode: route.mode,
    status: "created",
    startedAt: Date.now(),
    phases: {},
    toolCalls: 0,
    failures: 0,
    budget: { ...budget, deadlineAt: budget.deadlineAt ?? Date.now() + 120_000 },
    routeReason: route.reason,
    complexity: route.complexity
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

export function completeExecution(
  state: ExecutionState,
  status: Exclude<ExecutionStatus, "created" | "running" | "waiting_for_tool">
): void {
  state.status = status;
}

export function summarizeExecution(state: ExecutionState): Record<string, unknown> {
  const totalMs = Date.now() - state.startedAt;
  return {
    request_id: state.requestId,
    mode: state.mode,
    channel: state.channel,
    response_style: state.responseStyle,
    complexity: state.complexity,
    route: state.routeReason,
    status: state.status,
    total_ms: totalMs,
    phases: Object.fromEntries(
      Object.entries(state.phases).map(([name, phase]) => [
        name,
        phase.durationMs ?? Date.now() - phase.startedAt
      ])
    ),
    tool_calls: state.toolCalls,
    failures: state.failures
  };
}

/** System guidance injected when the user should hear the answer, not only read it. */
export const SPOKEN_STYLE_GUIDANCE = [
  "The user is on a spoken channel. You must emit TWO parts in this exact layout:",
  "",
  "===SPOKEN===",
  "<what ElevenLabs will turn into speech and read aloud>",
  "===TEXT===",
  "<what Telegram shows as text only — sources, links, tables, ids, anything that should not be spoken>",
  "",
  "Rules for ===SPOKEN===:",
  "- Short sentences, plain words, lead with the result.",
  "- Never read URLs, link paths, or https out loud. Do not spell out links.",
  "- Do not read dense tables, SHA hashes, or long source lists aloud.",
  "- If sources matter, say briefly that the sources are in the text message (for example: I put the sources in the text).",
  "- Do not narrate tool use. Do not pad with filler.",
  "",
  "Rules for ===TEXT===:",
  "- Put links, Source / Last checked, tables, ids, and other unspeakable detail here.",
  "- If there is nothing extra, leave ===TEXT=== completely empty. Do not write placeholders.",
  "- This text is shown in Telegram; it is not sent to TTS."
].join("\n");

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

/**
 * Map a final agent string into the voice boundary object.
 * Keeps the contract stable for a future TTS layer.
 */
export function toVoiceResponse(text: string, options?: { maxChars?: number }): VoiceResponse {
  const maxChars = options?.maxChars ?? 900;
  let body = text.trim() || "I could not produce a spoken reply.";
  if (body.length > maxChars) {
    const cut = body.slice(0, maxChars);
    const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    body = (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut).trim() + " …";
  }
  return { text: body, speak: true, interruptible: true };
}
