import { randomUUID } from "node:crypto";

export type InteractionChannel = "telegram" | "voice" | "api";
export type ExecutionMode = "adaptive" | "workflow";
export type ExecutionStatus = "created" | "running" | "waiting_for_tool" | "waiting_for_approval" | "completed" | "partial" | "failed";
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

/** Structured route signals for telemetry (O3) — never used as permission authority. */
export type RouteSignals = {
  multiPart: boolean;
  comparative: boolean;
  multiQuestion: boolean;
  multiIntent: boolean;
  numbered: boolean;
  length: number;
};

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
  /** Router recommended calling the smart planner (before plan result). */
  usePlanner?: boolean;
  /** True only when createExecutionPlan returned a validated plan. */
  planCreated?: boolean;
  planSteps?: number;
  routeSignals?: RouteSignals;
}

export interface RouteDecision {
  mode: ExecutionMode;
  reason: string;
  /** When true, the controller may call the smart planner before the tool loop. */
  usePlanner: boolean;
  complexity: RouteComplexity;
  /** Cheap structural signals for logs and future budget tiers — not intent labels. */
  signals?: RouteSignals;
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
      complexity: "simple",
      signals: {
        multiPart: false,
        comparative: false,
        multiQuestion: false,
        multiIntent: false,
        numbered: false,
        length: 0
      }
    };
  }

  const { complexity, signals } = estimateComplexityDetailed(trimmed);
  // Voice turns prefer a direct loop unless the transcript is clearly multi-step;
  // planning latency hurts spoken UX more than text.
  const voiceBias = (options?.channel === "voice" || options?.responseStyle === "spoken") && complexity !== "complex";

  if (complexity === "complex" && !voiceBias) {
    return {
      mode: "adaptive",
      reason: signals.multiIntent
        ? "multi-intent structure; planner may decompose"
        : "multi-step or comparative ask; planner may decompose",
      usePlanner: true,
      complexity,
      signals
    };
  }

  if (complexity === "standard") {
    return {
      mode: "adaptive",
      reason: "standard ask; direct adaptive loop",
      usePlanner: false,
      complexity,
      signals
    };
  }

  return {
    mode: "adaptive",
    reason: voiceBias
      ? "spoken/simple path; skip planner for lower latency"
      : "simple ask; direct adaptive loop",
    usePlanner: false,
    complexity,
    signals
  };
}

/**
 * Heuristics only for budget shaping. They must not invent domain intent
 * (e.g. treating "when the match starts" as a workflow by keyword alone).
 */
export function estimateComplexity(text: string): RouteComplexity {
  return estimateComplexityDetailed(text).complexity;
}

/**
 * O1: richer structural signals without domain keyword modes.
 * multiIntent catches dual-action asks ("search X and email Y") that length
 * heuristics alone often classify as standard.
 */
export function estimateComplexityDetailed(text: string): {
  complexity: RouteComplexity;
  signals: RouteSignals;
} {
  const trimmed = text.trim();
  const length = trimmed.length;
  const lower = trimmed.toLowerCase();

  const sentenceBreaks = (trimmed.match(/[.!?](?:\s|$)/g) ?? []).length;
  const lineBreaks = (trimmed.match(/\n/g) ?? []).length;
  const numbered =
    /^\s*\d+[\).:-]/m.test(trimmed) || /(?:^|\n)\s*[-*]\s+\S+/m.test(trimmed);

  const sequenceWords =
    /\b(?:then|after that|next|also|additionally|finally|afterwards)\b/i.test(trimmed);

  // Explicit multi-part structure without claiming what the parts mean.
  const multiPart =
    sentenceBreaks >= 2 || lineBreaks >= 2 || numbered || sequenceWords;

  const comparative =
    /\b(?:compare|versus|vs\.?|difference between|pros and cons)\b/i.test(lower);

  const multiQuestion = (trimmed.match(/\?/g) ?? []).length >= 2;

  // Dual-task / multi-intent: two distinct action-ish verbs joined by and/then/,
  // without inventing product domains (no "monitor", "workflow", sport keywords).
  const actionVerb =
    /\b(?:search|find|look\s*up|fetch|read|write|edit|create|draft|send|email|schedule|remind|list|summarize|analyse|analyze|compare|check|update|delete|rename|build|prepare)\b/gi;
  const actionMatches = lower.match(actionVerb) ?? [];
  const uniqueActions = new Set(actionMatches.map((m) => m.replace(/\s+/g, " ").trim()));
  const joinedActions =
    uniqueActions.size >= 2 &&
    /\b(?:and|then|,\s*(?:also|then)?|after that)\b/i.test(trimmed);
  const multiIntent = joinedActions || (uniqueActions.size >= 3 && length >= 40);

  const signals: RouteSignals = {
    multiPart,
    comparative,
    multiQuestion,
    multiIntent,
    numbered,
    length
  };

  // Short social / single-shot replies stay simple unless multi-intent is clear.
  if (length <= 48 && !/[?\n]/.test(trimmed) && !multiIntent) {
    return { complexity: "simple", signals };
  }

  if (
    (multiPart && length >= 100) ||
    comparative ||
    multiQuestion ||
    (numbered && length >= 60) ||
    (multiIntent && length >= 35)
  ) {
    return { complexity: "complex", signals };
  }

  if (length >= 220 || (sentenceBreaks >= 1 && length >= 120) || multiPart || multiIntent) {
    return { complexity: "standard", signals };
  }

  return {
    complexity: length <= 80 ? "simple" : "standard",
    signals
  };
}

/** Resolve response style from explicit option or channel default. */
export function resolveResponseStyle(
  channel: InteractionChannel | undefined,
  responseStyle?: ResponseStyle
): ResponseStyle {
  if (responseStyle) return responseStyle;
  return channel === "voice" ? "spoken" : "text";
}


/** O2: budget tiers by complexity — simple must not burn research budgets. */
export type ComplexityBudget = {
  maxModelRounds: number;
  maxToolRounds: number;
  maxParallelCalls: number;
  deadlineMs: number;
};

export function budgetForComplexity(
  complexity: RouteComplexity,
  defaults: {
    maxModelRounds: number;
    maxToolRounds: number;
    maxParallelCalls: number;
    deadlineMs: number;
  }
): ComplexityBudget {
  switch (complexity) {
    case "simple":
      return {
        maxModelRounds: Math.min(4, defaults.maxModelRounds),
        maxToolRounds: Math.min(8, defaults.maxToolRounds),
        maxParallelCalls: Math.min(2, defaults.maxParallelCalls),
        deadlineMs: Math.min(90_000, defaults.deadlineMs)
      };
    case "standard":
      return {
        maxModelRounds: Math.min(8, defaults.maxModelRounds),
        maxToolRounds: Math.min(24, defaults.maxToolRounds),
        maxParallelCalls: Math.min(4, defaults.maxParallelCalls),
        deadlineMs: Math.min(240_000, defaults.deadlineMs)
      };
    case "complex":
    default:
      return {
        maxModelRounds: defaults.maxModelRounds,
        maxToolRounds: defaults.maxToolRounds,
        maxParallelCalls: defaults.maxParallelCalls,
        deadlineMs: defaults.deadlineMs
      };
  }
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
    complexity: route.complexity,
    usePlanner: route.usePlanner,
    planCreated: false,
    planSteps: 0,
    routeSignals: route.signals
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

/** Mark planner outcome on the execution state for O3 hit-rate telemetry. */
export function recordPlanOutcome(
  state: ExecutionState,
  plan: { steps: unknown[] } | null
): void {
  if (plan && Array.isArray(plan.steps) && plan.steps.length > 0) {
    state.planCreated = true;
    state.planSteps = plan.steps.length;
  } else {
    state.planCreated = false;
    state.planSteps = 0;
  }
}

/**
 * Structured execution summary for logs / aggregation (O3).
 * Fields are stable so planner hit rate can be computed offline:
 *   use_planner, plan_created, plan_steps, complexity, total_ms, tool_calls
 */
export function summarizeExecution(state: ExecutionState): Record<string, unknown> {
  const totalMs = Date.now() - state.startedAt;
  return {
    request_id: state.requestId,
    mode: state.mode,
    channel: state.channel,
    response_style: state.responseStyle,
    complexity: state.complexity,
    route: state.routeReason,
    use_planner: Boolean(state.usePlanner),
    plan_created: Boolean(state.planCreated),
    plan_steps: state.planSteps ?? 0,
    route_signals: state.routeSignals ?? null,
    budget_max_model_rounds: state.budget.maxModelRounds,
    budget_max_tool_rounds: state.budget.maxToolRounds,
    budget_deadline_ms: Math.max(0, state.budget.deadlineAt - state.startedAt),
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
  "<what Telegram shows as text only — tables, ids, or other detail that should not be spoken>",
  "",
  "Rules for ===SPOKEN===:",
  "- Short sentences, plain words, lead with the result.",
  "- Never read URLs, link paths, or https out loud. Do not spell out links.",
  "- Do not read dense tables, SHA hashes, or long source lists aloud.",
  "- If sources matter, say briefly that the sources are in the text message (for example: I put the sources in the text).",
  "- Do not narrate tool use. Do not pad with filler.",
  "",
  "Rules for ===TEXT===:",
  "- Put tables, ids, and other unspeakable detail here. The application adds verified clickable sources separately; do not include a Source / Last checked line or retrieval timestamp.",
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
