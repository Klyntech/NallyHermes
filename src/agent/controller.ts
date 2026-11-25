import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { config } from "../config.js";
import type { ProgressEvent } from "./progress.js";
import { agentTools } from "./definitions.js";
import { prepareRequest } from "./planner.js";
import { executeToolCalls, isReadOnlyCall, type ToolCallInput } from "./executor.js";
import { evaluateTurn, finalResponse, auditFactualAnswer, type ModelToolCall } from "./evaluator.js";
import { createExecutionPlan, type ExecutionPlan, type ExecutionPlanStep } from "./smartPlanner.js";
import { beginPhase, completeExecution, createExecutionState, endPhase, recordPlanOutcome, routeRequest, summarizeExecution, SPOKEN_STYLE_GUIDANCE, type ExecutionState, type InteractionChannel, type ResponseStyle } from "./orchestra.js";
import { buildAdaptiveContextPack, formatContextPackForModel } from "./contextPack.js";
import { composePartialAnswer } from "./partial.js";
import { beginTurnAffect, noteTaskOutcome, noteToolOutcome } from "./affect.js";
import { requiresAcademicSourceCheck } from "./academicSourceGate.js";
import { appendSourcesFooter, extractAnswerSources, type AnswerSource } from "./sourceAttribution.js";

// NOTE: Full controller body restored in follow-up if truncated — see artifacts.
export async function runAgent(): Promise<string | null> {
  throw new Error("controller restore incomplete — push full file");
}
