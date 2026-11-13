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

export type ClaimAuditIssue = {
  code:
    | "approx_number"
    | "not_disclosed_language"
    | "table_without_proof"
    | "numeric_without_evidence"
    | "complete_claim_without_tools";
  detail: string;
};

export type ClaimAuditResult = {
  ok: boolean;
  issues: ClaimAuditIssue[];
  /** System note to push when ok is false and another model round is allowed. */
  rewriteHint: string;
};

const APPROX_NUMBER =
  /(?:\babout\b|\baround\b|\bapproximately\b|\bcircca\b|\broughly\b|\b~)\s*\d|\b\d[\d,.]*(?:\s*[-–—]\s*\d[\d,.]*)?\s*(?:\+|~)|\B~\s*\d/i;
const NOT_DISCLOSED =
  /\bnot\s+(?:separately\s+)?disclosed\b|\bnot\s+announced\b|\bundisclosed\b|\bunknown\s+pricing\b|\bn\/a\b(?=.*(?:price|cost|platform))/i;
const MARKDOWN_TABLE_ROW = /^\s*\|.+\|\s*$/m;
const PROOF_HINT =
  /https?:\/\/|source\s*\/\s*last\s*checked|last\s*checked|sha\b|\b[0-9a-f]{7,40}\b|not\s+verified|\bpartial\b/i;
const NUMERIC_CLAIM =
  /(?:\$\s*\d|\b\d+[\d,.]*\s*(?:\/\s*(?:m|million)\b)?|\b\d+\s*(?:commits?|repos?|branches?|models?|tokens?|USD|usd)\b)/i;

/**
 * Lightweight, deterministic claim audit for factual / tabular answers.
 * Blocks common half-bluff patterns before the reply is shown to the user.
 */
export function auditFactualAnswer(
  answer: string,
  options?: { hadResearchTools?: boolean }
): ClaimAuditResult {
  const text = answer.trim();
  const issues: ClaimAuditIssue[] = [];
  const hadResearchTools = options?.hadResearchTools ?? false;

  if (APPROX_NUMBER.test(text)) {
    issues.push({
      code: "approx_number",
      detail: "Answer uses approximate numeric language (~ / about / roughly) without labeling a verified estimate."
    });
  }

  if (NOT_DISCLOSED.test(text)) {
    issues.push({
      code: "not_disclosed_language",
      detail: "Answer uses 'not disclosed' / 'not announced' language; use Not verified only after checking a primary source."
    });
  }

  const hasTable = MARKDOWN_TABLE_ROW.test(text) && (text.match(/\|/g)?.length ?? 0) >= 6;
  if (hasTable && !PROOF_HINT.test(text)) {
    issues.push({
      code: "table_without_proof",
      detail: "Factual table lacks proof links, SHA/id, or a Source / Last checked line."
    });
  }

  if (hasTable && NUMERIC_CLAIM.test(text) && !hadResearchTools) {
    issues.push({
      code: "numeric_without_evidence",
      detail: "Numeric or priced table cells appear without prior web_search/fetch evidence in this turn."
    });
  }

  // Strong "complete inventory" language without tools is a red flag
  if (
    !hadResearchTools &&
    /\b(all|every|complete)\b/i.test(text) &&
    NUMERIC_CLAIM.test(text) &&
    text.length > 280
  ) {
    issues.push({
      code: "complete_claim_without_tools",
      detail: "Answer claims complete coverage with numbers but no research tools were used."
    });
  }

  const ok = issues.length === 0;
  const rewriteHint = ok
    ? ""
    : [
        "Accuracy audit failed on your previous draft. Fix it before finishing:",
        ...issues.map((i) => `- (${i.code}) ${i.detail}`),
        "Rules: pull primary evidence with web_search (depth advanced / research) and fetch; do not use ~ or 'not disclosed'; write Not verified only after checking; factual tables need proof links and Source / Last checked; label Partial when coverage is incomplete.",
        "Revise the answer now, or call tools if evidence is missing. Do not repeat the same unbacked table."
      ].join("\n");

  return { ok, issues, rewriteHint };
}
