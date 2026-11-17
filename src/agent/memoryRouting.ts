const NON_MEMORY_RECORD_LOOKUP = /\b(schedule|schedules|reminder|reminders|calendar|appointments?)\b/i;
const ACADEMIC_SOURCE_LOOKUP = /\b(?:academic library|library|lecture notes?|class notes?|course notes?|course readings?|study materials?|assigned readings?|uploaded (?:PDFs?|files?|documents?)|ingested (?:PDFs?|files?|documents?))\b/i;

/** Dedicated schedule/academic stores must not be blended with personal-memory context. */
export function shouldUseSemanticMemory(query: string): boolean {
  return Boolean(query.trim()) && !NON_MEMORY_RECORD_LOOKUP.test(query) && !ACADEMIC_SOURCE_LOOKUP.test(query);
}
