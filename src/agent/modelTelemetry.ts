import { performance } from "node:perf_hooks";

export type ModelCallPhase =
  | "planning"
  | "step_execution"
  | "recovery"
  | "synthesis"
  | "direct_execution";

export type ModelContextMode =
  | "bounded_history"
  | "full_accumulated"
  | "step_context_full"
  | "step_context_delta";

export interface ModelCallMetadata {
  phase: ModelCallPhase;
  reason: string;
  model: string;
  contextMode: ModelContextMode;
  messages: readonly unknown[];
}

export interface ModelCallTrace {
  call_number: number;
  phase: ModelCallPhase;
  reason: string;
  model: string;
  context_mode: ModelContextMode;
  started_at: string;
  duration_ms: number;
  status: "success" | "error";
  message_count: number;
  context_characters: number;
  estimated_input_tokens: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  error?: string;
}

interface UsageLike {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ModelCallTelemetry {
  run<T extends { usage?: UsageLike | null }>(
    metadata: ModelCallMetadata,
    operation: () => Promise<T>
  ): Promise<T>;
  getCalls(): ModelCallTrace[];
}

/** Request-scoped, concurrency-safe model-call instrumentation. */
export function createModelCallTelemetry(
  onCall?: (trace: ModelCallTrace) => Promise<void> | void
): ModelCallTelemetry {
  let sequence = 0;
  const calls: ModelCallTrace[] = [];

  const publish = async (trace: ModelCallTrace): Promise<void> => {
    calls.push(trace);
    try {
      await onCall?.(trace);
    } catch (error) {
      console.warn("Model-call telemetry delivery failed:", error);
    }
  };

  return {
    async run<T extends { usage?: UsageLike | null }>(
      metadata: ModelCallMetadata,
      operation: () => Promise<T>
    ): Promise<T> {
      const callNumber = ++sequence;
      const startedAt = new Date().toISOString();
      const started = performance.now();
      const serializedContext = JSON.stringify(metadata.messages);
      const contextCharacters = serializedContext.length;
      const base = {
        call_number: callNumber,
        phase: metadata.phase,
        reason: metadata.reason,
        model: metadata.model,
        context_mode: metadata.contextMode,
        started_at: startedAt,
        message_count: metadata.messages.length,
        context_characters: contextCharacters,
        estimated_input_tokens: Math.ceil(contextCharacters / 4)
      };

      try {
        const response = await operation();
        const durationMs = Math.round(performance.now() - started);
        await publish({
          ...base,
          duration_ms: durationMs,
          status: "success",
          ...(typeof response.usage?.prompt_tokens === "number" ? { input_tokens: response.usage.prompt_tokens } : {}),
          ...(typeof response.usage?.completion_tokens === "number" ? { output_tokens: response.usage.completion_tokens } : {}),
          ...(typeof response.usage?.total_tokens === "number" ? { total_tokens: response.usage.total_tokens } : {})
        });
        return response;
      } catch (error) {
        await publish({
          ...base,
          duration_ms: Math.round(performance.now() - started),
          status: "error",
          error: (error instanceof Error ? error.message : String(error)).slice(0, 300)
        });
        throw error;
      }
    },
    getCalls: () => calls.map((call) => ({ ...call }))
  };
}
