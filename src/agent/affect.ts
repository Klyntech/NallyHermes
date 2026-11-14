/**
 * Nally affect layer (v3.1)
 *
 * Two tracks:
 * - userAffect: inferred from the current message (for listening / tone)
 * - agentAffect: Nally's internal state, updated by task events + time decay
 *
 * Display rules: almost never narrate feelings; only inject a short tone hint
 * when the shift is meaningful and the channel is social (not silent workers).
 *
 * Reply policies (stress / confuse / warm / urgent) draw on clinical-style
 * communication patterns: acknowledge → align → act; do not mirror intensity;
 * prefer one clear question over long empathy scripts.
 */

export type UserAffect = {
  valence: number; // -1..1 negative..positive
  arousal: number; // 0..1 calm..activated
  frustration: number; // 0..1
  warmth: number; // 0..1
  confusion: number; // 0..1 goal/blocked understanding
};

export type AgentAffect = {
  valence: number;
  arousal: number;
  confidence: number; // 0..1
  frustration: number;
  curiosity: number;
  updatedAt: string;
  lastTopicKey: string;
};

export type AffectDecisionParams = {
  riskTolerance: number;
  shouldExplore: boolean;
  maxExtraRetries: number;
  preferClarify: boolean;
};

export type ReplyPolicy = "baseline" | "stress" | "confuse" | "warm" | "urgent";

export type AffectSnapshot = {
  user: UserAffect;
  agent: AgentAffect;
  params: AffectDecisionParams;
  policy: ReplyPolicy;
  promptHint: string | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function defaultAgentAffect(): AgentAffect {
  return {
    valence: 0.15,
    arousal: 0.25,
    confidence: 0.55,
    frustration: 0.1,
    curiosity: 0.35,
    updatedAt: new Date().toISOString(),
    lastTopicKey: ""
  };
}

/** Rough topic key so unrelated asks decay sticky mood. */
export function topicKey(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);
  return words.join(" ") || "general";
}

/** Infer user affect from the current utterance only (not Nally's mood). */
export function inferUserAffect(userMessage: string): UserAffect {
  const t = userMessage.toLowerCase();
  let valence = 0;
  let arousal = 0.3;
  let frustration = 0.1;
  let warmth = 0.4;
  let confusion = 0.1;

  if (/\b(thanks|thank you|great|awesome|love|appreciate|perfect|congratulations)\b/.test(t)) {
    valence += 0.45;
    warmth += 0.25;
  }
  if (/\b(please|kindly|when you can)\b/.test(t)) {
    warmth += 0.1;
  }
  if (/\b(angry|furious|upset|annoyed|frustrated|ridiculous|useless|stupid|hate this)\b/.test(t)) {
    valence -= 0.5;
    arousal += 0.35;
    frustration += 0.45;
    warmth -= 0.2;
  }
  if (/\b(asap|urgent|now|immediately|hurry)\b/.test(t)) {
    arousal += 0.25;
  }
  if (
    /\b(confused|stuck|don't understand|dont understand|what do you mean|unclear|lost me|how does this work)\b/.test(
      t
    )
  ) {
    confusion += 0.45;
    valence -= 0.1;
    warmth += 0.05;
    arousal += 0.1;
  }
  if (/\b(sorry|help)\b/.test(t) && confusion < 0.3) {
    valence -= 0.1;
    warmth += 0.1;
  }
  if (/\b(hi|hello|hey|good morning|good evening)\b/.test(t) && t.length < 40) {
    warmth += 0.2;
    valence += 0.1;
  }

  return {
    valence: clamp(valence, -1, 1),
    arousal: clamp(arousal, 0, 1),
    frustration: clamp(frustration, 0, 1),
    warmth: clamp(warmth, 0, 1),
    confusion: clamp(confusion, 0, 1)
  };
}

/** Time decay toward a calm baseline. */
export function decayAgentAffect(agent: AgentAffect, now = new Date()): AgentAffect {
  const then = new Date(agent.updatedAt).getTime();
  const minutes = Number.isFinite(then) ? Math.max(0, (now.getTime() - then) / 60_000) : 30;
  const factor = Math.pow(0.5, minutes / 45);
  const baseline = defaultAgentAffect();
  const lerp = (a: number, b: number) => b + (a - b) * factor;
  return {
    valence: lerp(agent.valence, baseline.valence),
    arousal: lerp(agent.arousal, baseline.arousal),
    confidence: lerp(agent.confidence, baseline.confidence),
    frustration: lerp(agent.frustration, baseline.frustration),
    curiosity: lerp(agent.curiosity, baseline.curiosity),
    updatedAt: now.toISOString(),
    lastTopicKey: agent.lastTopicKey
  };
}

export type AffectEvent =
  | { type: "topic_change" }
  | { type: "tool_success" }
  | { type: "tool_failure" }
  | { type: "task_complete" }
  | { type: "task_partial" }
  | { type: "user_warm" }
  | { type: "user_frustrated" };

export function applyAffectEvent(agent: AgentAffect, event: AffectEvent): AgentAffect {
  const next = { ...agent, updatedAt: new Date().toISOString() };
  switch (event.type) {
    case "topic_change":
      next.frustration = clamp(next.frustration * 0.4, 0, 1);
      next.arousal = clamp(next.arousal * 0.6, 0, 1);
      next.curiosity = clamp(next.curiosity + 0.1, 0, 1);
      break;
    case "tool_success":
      next.confidence = clamp(next.confidence + 0.06, 0, 1);
      next.frustration = clamp(next.frustration - 0.08, 0, 1);
      next.valence = clamp(next.valence + 0.05, -1, 1);
      break;
    case "tool_failure":
      next.frustration = clamp(next.frustration + 0.12, 0, 1);
      next.confidence = clamp(next.confidence - 0.05, 0, 1);
      next.arousal = clamp(next.arousal + 0.08, 0, 1);
      next.valence = clamp(next.valence - 0.06, -1, 1);
      break;
    case "task_complete":
      next.confidence = clamp(next.confidence + 0.08, 0, 1);
      next.frustration = clamp(next.frustration * 0.5, 0, 1);
      next.valence = clamp(next.valence + 0.1, -1, 1);
      next.arousal = clamp(next.arousal * 0.7, 0, 1);
      break;
    case "task_partial":
      next.frustration = clamp(next.frustration + 0.05, 0, 1);
      next.confidence = clamp(next.confidence - 0.03, 0, 1);
      break;
    case "user_warm":
      next.valence = clamp(next.valence + 0.08, -1, 1);
      next.curiosity = clamp(next.curiosity + 0.05, 0, 1);
      break;
    case "user_frustrated":
      next.arousal = clamp(next.arousal * 0.7, 0, 1);
      next.frustration = clamp(next.frustration * 0.8, 0, 1);
      next.valence = clamp(next.valence - 0.02, -1, 1);
      break;
  }
  return next;
}

export function getDecisionParams(agent: AgentAffect, user: UserAffect): AffectDecisionParams {
  const riskTolerance = clamp(0.35 + agent.confidence * 0.4 - agent.frustration * 0.35, 0.1, 0.85);
  const shouldExplore =
    agent.curiosity > 0.55 && agent.frustration < 0.55 && user.frustration < 0.6;
  const maxExtraRetries = agent.frustration > 0.65 ? 0 : agent.frustration > 0.4 ? 1 : 2;
  const preferClarify =
    user.frustration > 0.45 ||
    user.arousal > 0.7 ||
    user.confusion > 0.4 ||
    agent.confidence < 0.35;
  return { riskTolerance, shouldExplore, maxExtraRetries, preferClarify };
}

/**
 * Choose a reply policy from user+agent state.
 * Priority: urgent > stress > confuse > warm > baseline.
 */
export function selectReplyPolicy(user: UserAffect, agent: AgentAffect): ReplyPolicy {
  if (user.arousal > 0.65 && user.frustration > 0.35) return "urgent";
  if (user.frustration > 0.45) return "stress";
  if (user.confusion > 0.4) return "confuse";
  if (user.warmth > 0.55 && user.frustration < 0.3) return "warm";
  if (agent.frustration > 0.55 || agent.confidence < 0.35) return "stress";
  return "baseline";
}

const POLICY_INSTRUCTIONS: Record<Exclude<ReplyPolicy, "baseline">, string[]> = {
  // Acknowledge situation → one question or one next step. No intensity matching.
  stress: [
    "Policy=stress (clinical-style): Acknowledge the setback in one short clause, then move to a useful next step.",
    "Do not mirror anger or use theatrical empathy; acknowledge the setback briefly and stay practical.",
    "Prefer naming the blocker if known, or ask a single clear question.",
    "Keep the reply short. No tool-menu dump unless they ask for options."
  ],
  confuse: [
    "Policy=confuse: User likely does not understand the last step or the system state.",
    "Explain the relevant bit in plain language, then confirm with one check question.",
    "Do not add new tasks or broad capability lists until the confusion is resolved."
  ],
  warm: [
    "Policy=warm: Friendly, light register is fine; stay competent, not gushy or over-familiar.",
    "Match their energy briefly, then continue the task or ask what they want next."
  ],
  urgent: [
    "Policy=urgent: Prioritize speed and clarity. Lead with the action or the blocker.",
    "Skip small talk. One step at a time. Confirm the critical detail only if missing."
  ]
};

/**
 * Short tone hint for the system prompt. Never asks the model to monologue feelings.
 * Returns null when affect is near baseline (no injection).
 */
export function buildAffectPromptHint(
  user: UserAffect,
  agent: AgentAffect,
  options?: { channel?: string; force?: boolean; policy?: ReplyPolicy }
): string | null {
  if (options?.channel === "workflow") return null;

  const policy = options?.policy ?? selectReplyPolicy(user, agent);

  const nearBaseline =
    policy === "baseline" &&
    Math.abs(agent.valence) < 0.2 &&
    agent.frustration < 0.25 &&
    user.frustration < 0.25 &&
    user.warmth < 0.55 &&
    user.confusion < 0.35 &&
    !options?.force;

  if (nearBaseline) return null;

  const lines = [
    "Affect context (internal only — do not narrate feelings or say you are an emotional system):",
    `- policy=${policy}`,
    `- User read: warmth=${user.warmth.toFixed(2)}, frustration=${user.frustration.toFixed(2)}, confusion=${user.confusion.toFixed(2)}, arousal=${user.arousal.toFixed(2)}.`,
    `- Your stance: confidence=${agent.confidence.toFixed(2)}, frustration=${agent.frustration.toFixed(2)}, valence=${agent.valence.toFixed(2)}.`
  ];

  if (policy !== "baseline") {
    lines.push(...POLICY_INSTRUCTIONS[policy]);
  }

  if (agent.frustration > 0.55) {
    lines.push(
      "Prefer fewer speculative tool retries; if blocked, say so plainly and ask one focused clarifying question."
    );
  }
  if (agent.confidence < 0.35) {
    lines.push("Be careful with claims; verify numbers before stating them.");
  }

  lines.push(
    "Avoid first-person emotion declarations. Let tone shift slightly; content stays accurate and on-task."
  );

  return lines.join("\n");
}

/** In-process store (per telegram user). Durable DB persistence can wrap this later. */
const store = new Map<string, AgentAffect>();

export function loadAgentAffect(telegramId: string): AgentAffect {
  const existing = store.get(telegramId);
  if (!existing) {
    const fresh = defaultAgentAffect();
    store.set(telegramId, fresh);
    return { ...fresh };
  }
  return decayAgentAffect(existing);
}

export function saveAgentAffect(telegramId: string, agent: AgentAffect): void {
  store.set(telegramId, { ...agent, updatedAt: new Date().toISOString() });
}

/**
 * Prepare affect for a turn: decay, topic change, user inference, optional prompt hint.
 */
export function beginTurnAffect(input: {
  telegramId: string;
  userMessage: string;
  channel?: string;
  injectPrompt?: boolean;
}): AffectSnapshot {
  const user = inferUserAffect(input.userMessage);
  let agent = loadAgentAffect(input.telegramId);
  const key = topicKey(input.userMessage);
  if (agent.lastTopicKey && key && agent.lastTopicKey !== key) {
    agent = applyAffectEvent(agent, { type: "topic_change" });
  }
  agent = { ...agent, lastTopicKey: key };

  if (user.frustration > 0.45) agent = applyAffectEvent(agent, { type: "user_frustrated" });
  else if (user.warmth > 0.55) agent = applyAffectEvent(agent, { type: "user_warm" });

  saveAgentAffect(input.telegramId, agent);
  const params = getDecisionParams(agent, user);
  const policy = selectReplyPolicy(user, agent);
  const promptHint =
    input.injectPrompt === false
      ? null
      : buildAffectPromptHint(user, agent, { channel: input.channel, policy });

  return { user, agent, params, policy, promptHint };
}

export function noteToolOutcome(telegramId: string, ok: boolean): AgentAffect {
  let agent = loadAgentAffect(telegramId);
  agent = applyAffectEvent(agent, ok ? { type: "tool_success" } : { type: "tool_failure" });
  saveAgentAffect(telegramId, agent);
  return agent;
}

export function noteTaskOutcome(telegramId: string, kind: "complete" | "partial"): AgentAffect {
  let agent = loadAgentAffect(telegramId);
  agent = applyAffectEvent(agent, kind === "complete" ? { type: "task_complete" } : { type: "task_partial" });
  saveAgentAffect(telegramId, agent);
  return agent;
}
