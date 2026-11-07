export interface ExecutionBudgetSnapshot {
  toolCalls: number;
  modelTurns: number;
  maxToolCalls: number;
  maxModelTurns: number;
}

export interface ExecutionBudget {
  reserveToolCall(): boolean;
  reserveModelTurn(): boolean;
  snapshot(): ExecutionBudgetSnapshot;
}

/**
 * Request-scoped, synchronous reservations make the limits safe to share
 * across concurrently executing read-only steps. Retries reserve separately.
 */
export function createExecutionBudget(limits: {
  maxToolCalls: number;
  maxModelTurns: number;
}): ExecutionBudget {
  let toolCalls = 0;
  let modelTurns = 0;
  return {
    reserveToolCall() {
      if (toolCalls >= limits.maxToolCalls) return false;
      toolCalls++;
      return true;
    },
    reserveModelTurn() {
      if (modelTurns >= limits.maxModelTurns) return false;
      modelTurns++;
      return true;
    },
    snapshot() {
      return {
        toolCalls,
        modelTurns,
        maxToolCalls: limits.maxToolCalls,
        maxModelTurns: limits.maxModelTurns
      };
    }
  };
}
