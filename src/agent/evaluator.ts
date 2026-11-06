export type ModelToolCall =
  | { id: string; type: "function"; function: { name: string; arguments: string } }
  | { id: string; type: "custom" };

export interface ModelTurn {
  content?: string | null;
  tool_calls?: ModelToolCall[] | null;
}

export type TurnEvaluation =
  | { kind: "complete"; answer: string }
  | { kind: "execute_tools"; calls: NonNullable<ModelTurn["tool_calls"]> }
  | { kind: "limit_reached" }
  | { kind: "empty_turn" };

/**
 * Deterministic completion gate. It does not ask another model to critique
 * every answer; it checks whether the model returned text, tool calls, or
 * exhausted the configured round budget.
 */
export function evaluateTurn(turn: ModelTurn | undefined, round: number, maxRounds: number): TurnEvaluation {
  if (!turn) return { kind: "empty_turn" };
  if (turn.tool_calls?.length) {
    if (round >= maxRounds - 1) return { kind: "limit_reached" };
    return { kind: "execute_tools", calls: turn.tool_calls };
  }
  return {
    kind: "complete",
    answer: turn.content?.trim() || "I couldn't generate a response. Please try again."
  };
}

export function finalResponse(answer: string): string {
  return answer.trim() || "I couldn't generate a response. Please try again.";
}
