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
    | "complete_claim_without_tools"
    | "price_without_evidence"
    | "dated_claim_without_evidence";
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
  /https?:\/\/|sha\b|\b[0-9a-f]{7,40}\b|not\s+verified/i;
const NUMERIC_CLAIM =
  /(?:\$\s*\d|\b\d+[\d,.]*\s*(?:\/\s*(?:m|million)\b)?|\b\d+\s*(?:commits?|repos?|branches?|models?|tokens?|USD|usd)\b)/i;
const PRICE_CLAIM =
  /(?:\$\s*\d|\b\d+[\d,.]*\s*(?:USD|usd|EUR|eur|GBP|gbp)\b|\bprice[sd]?\b.{0,40}\b\d)/i;
const DATED_CLAIM =
  /\b(?:on|as of|since|until|before|after)\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b|\b20[2-3]\d[-/]\d{2}[-/]\d{2}\b/i;

export type ClaimAuditOptions = {
  hadResearchTools?: boolean;
  hasSources?: boolean;
  /** Spoken replies skip table layout checks but still catch unbacked numbers and inventory claims. */
  style?: "text" | "spoken";
};

/**
 * Lightweight, deterministic claim audit for factual / tabular answers.
 * Blocks common half-bluff patterns before the reply is shown to the user.
 * Application authority: model fluency never overrides this gate.
 */
export function auditFactualAnswer(
  answer: string,
  options?: ClaimAuditOptions
): ClaimAuditResult {
  const text = answer.trim();
  const issues: ClaimAuditIssue[] = [];
  const hadResearchTools = options?.hadResearchTools ?? false;
  const hasSources = options?.hasSources ?? false;
  const spoken = options?.style === "spoken";

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

  // Text path: table structure checks
  if (!spoken) {
    const hasTable = MARKDOWN_TABLE_ROW.test(text) && (text.match(/\|/g)?.length ?? 0) >= 6;
    if (hasTable && !hasSources && !PROOF_HINT.test(text)) {
      issues.push({
        code: "table_without_proof",
        detail: "Factual table lacks proof links, source identifiers, or verified tool-source metadata."
      });
    }

    if (hasTable && NUMERIC_CLAIM.test(text) && !hadResearchTools) {
      issues.push({
        code: "numeric_without_evidence",
        detail: "Numeric or priced table cells appear without prior web_search/fetch evidence in this turn."
      });
    }
  }

  // Prices without any research tools (text and spoken)
  if (!hadResearchTools && PRICE_CLAIM.test(text) && text.length > 40) {
    issues.push({
      code: "price_without_evidence",
      detail: "Price or currency figures appear without web_search/fetch evidence in this turn."
    });
  }

  // Specific calendar dates presented as fact without tools
  if (!hadResearchTools && DATED_CLAIM.test(text) && text.length > 60) {
    issues.push({
      code: "dated_claim_without_evidence",
      detail: "Specific dated claims appear without research tool evidence; verify or qualify as unverified."
    });
  }

  // Strong "complete inventory" language without tools is a red flag
  if (
    !hadResearchTools &&
    /\b(all|every|complete)\b/i.test(text) &&
    NUMERIC_CLAIM.test(text) &&
    text.length > (spoken ? 160 : 280)
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
        spoken
          ? "Rules for spoken replies: do not invent prices, counts, or dates. Call web_search/fetch when needed, or say you could not verify. Do not use ~ or 'about N' for hard facts. Keep speech short; detailed tables belong in text."
          : "Rules: pull primary evidence with web_search and fetch when needed; do not use ~ or 'not disclosed'; write Not verified only after checking. Factual tables must be backed by sources; the application adds a clickable Sources footer automatically. Do not add retrieval timestamps or status labels such as Partial/Complete.",
        "Revise the answer now, or call tools if evidence is missing. Do not repeat the same unbacked claims."
      ].join("\n");

  return { ok, issues, rewriteHint };
}
