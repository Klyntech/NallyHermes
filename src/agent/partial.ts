import { classifyFailure, type ClassifiedFailure } from "./failure.js";

export type PartialStep = {
  task?: string;
  status: "completed" | "partial" | "failed";
  answer?: string;
  failureReason?: string;
};

/**
 * Build a user-facing partial answer when the orchestra stops early.
 * Prefer honest limitation + any verified findings over silence or fake completeness.
 */
export function composePartialAnswer(input: {
  reason: string;
  outcomes?: PartialStep[];
  lastAssistantNote?: string;
}): string {
  const classified: ClassifiedFailure = classifyFailure(input.reason);
  const findings = (input.outcomes ?? [])
    .filter((o) => o.answer && o.status !== "failed")
    .map((o) => (o.task ? `${o.task}: ${o.answer}` : o.answer!));

  const lines: string[] = [];

  if (input.lastAssistantNote?.trim()) {
    lines.push(input.lastAssistantNote.trim());
  } else if (findings.length) {
    lines.push(findings.slice(0, 5).join("\n"));
  }

  const limitation = (() => {
    switch (classified.kind) {
      case "timeout":
        return "I hit a time limit before finishing everything.";
      case "transient":
        return "A temporary provider or network issue stopped the rest of the work.";
      case "permission":
        return "I could not complete a step because of a permission or policy limit.";
      case "not_found":
        return "Something required for the next step was missing or not configured.";
      case "conflict":
        return "A conflict blocked the remaining steps.";
      case "validation":
        return "A step failed validation, so I stopped rather than guessing.";
      default:
        return input.reason.trim() || "I had to stop before the full answer was ready.";
    }
  })();

  if (!lines.length) {
    lines.push(limitation);
    if (classified.safeAlternative) {
      lines.push("Try a narrower ask, or retry in a moment if this looks transient.");
    }
    return lines.join("\n\n");
  }

  // Avoid duplicating the limitation if the assistant note already explains it
  if (!lines.join("\n").toLowerCase().includes(limitation.slice(0, 24).toLowerCase())) {
    lines.push(limitation);
  }

  const failed = (input.outcomes ?? []).filter((o) => o.status === "failed" && o.failureReason);
  if (failed.length) {
    lines.push(
      "Blocked steps: " +
        failed
          .slice(0, 3)
          .map((o) => o.failureReason)
          .join("; ")
    );
  }

  return lines.join("\n\n");
}
