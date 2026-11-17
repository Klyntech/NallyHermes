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
        return "I couldn't finish the remaining checks.";
      case "transient":
        return "A temporary service issue stopped the remaining checks.";
      case "permission":
        return "I couldn't complete one step because access wasn't available.";
      case "not_found":
        return "I couldn't continue because something needed for the next step wasn't available.";
      case "conflict":
        return "I found conflicting information that I couldn't resolve with the available evidence.";
      case "validation":
        return "One result didn't pass validation, so I didn't rely on it.";
      default:
        return "I couldn't finish the remaining checks.";
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
      "I also couldn't complete: " +
        failed
          .slice(0, 3)
          .map((o) => o.failureReason)
          .join("; ")
    );
  }

  return lines.join("\n\n");
}
