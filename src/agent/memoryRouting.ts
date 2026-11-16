const NON_MEMORY_RECORD_LOOKUP = /\b(schedule|schedules|reminder|reminders|calendar|appointments?)\b/i;

/** These authoritative records have dedicated stores and must not trigger semantic-memory search. */
export function shouldUseSemanticMemory(query: string): boolean {
  return Boolean(query.trim()) && !NON_MEMORY_RECORD_LOOKUP.test(query);
}
