const PERSONAL_LIBRARY_REFERENCE = /\b(?:my|our|the)\s+(?:academic\s+)?(?:library|course materials?|lecture notes?|class notes?|study materials?|uploaded files?|uploaded documents?|uploaded PDFs?|PDFs?|readings?)\b/i;
const LIBRARY_PROVENANCE_QUESTION = /\b(?:from|in|based on|came from|come from|found in|according to)\b/i;
const LIBRARY_USAGE_QUESTION = /\b(?:did|do|does|have|has)\b.{0,100}\b(?:use|check|search|look at|read|consult)\b/i;
const ACADEMIC_CONTENT_REQUEST = /\b(?:what|which|where|when|how|summari[sz]e|explain|find|search|cite|read|tell me|compare|list|include|contain|say|says)\b/i;

/** True only when the user explicitly asks for library/source provenance, not for every general-knowledge question. */
export function requiresAcademicSourceCheck(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return (
    (PERSONAL_LIBRARY_REFERENCE.test(text) && (
      LIBRARY_PROVENANCE_QUESTION.test(text) ||
      LIBRARY_USAGE_QUESTION.test(text) ||
      ACADEMIC_CONTENT_REQUEST.test(text)
    )) ||
    /\b(?:did|does|do|is|are|was|were)\b.{0,100}\b(?:come|came|found|taken|based)\b.{0,100}\b(?:library|notes?|PDFs?|documents?|readings?)\b/i.test(text)
  );
}
