export type FailureKind = "validation" | "permission" | "not_found" | "conflict" | "transient" | "timeout" | "provider" | "unknown";

export interface ClassifiedFailure {
  kind: FailureKind;
  retryable: boolean;
  safeAlternative: boolean;
  message: string;
}

export function classifyFailure(message: string): ClassifiedFailure {
  const value = message.trim();
  if (/timeout|timed out/i.test(value)) return { kind: "timeout", retryable: true, safeAlternative: true, message: value };
  if (/temporar|rate.?limit|\b429\b|\b5\d\d\b|ECONNRESET|ECONNREFUSED|ENOTFOUND|network|socket|fetch failed/i.test(value)) {
    return { kind: "transient", retryable: true, safeAlternative: true, message: value };
  }
  if (/not allowed|permission|unauthori[sz]ed|forbidden/i.test(value)) return { kind: "permission", retryable: false, safeAlternative: false, message: value };
  if (/not found|does not exist|no .* configured/i.test(value)) return { kind: "not_found", retryable: false, safeAlternative: true, message: value };
  if (/conflict|already exists|overlap/i.test(value)) return { kind: "conflict", retryable: false, safeAlternative: true, message: value };
  if (/invalid|must be|required|malformed/i.test(value)) return { kind: "validation", retryable: false, safeAlternative: true, message: value };
  if (/provider|calendar|oauth|api/i.test(value)) return { kind: "provider", retryable: false, safeAlternative: true, message: value };
  return { kind: "unknown", retryable: false, safeAlternative: true, message: value || "Unknown tool failure." };
}
