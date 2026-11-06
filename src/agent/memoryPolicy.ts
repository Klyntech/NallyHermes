const CONTEXT_CUES = [
  "what do you remember",
  "what did i tell you",
  "what did we discuss",
  "what did we decide",
  "what did we choose",
  "what was the model we chose",
  "what was the approach we chose",
  "which model did we choose",
  "which option did we select",
  "what did we pick",
  "we settled on",
  "our architecture",
  "our previous decision",
  "as we discussed",
  "as i mentioned",
  "last time",
  "previously",
  "earlier",
  "we agreed",
  "we decided",
  "continue where we left off",
  "my preferences",
  "my usual",
  "my long-term goal",
  "our plan",
  "our project decisions",
  "based on what i said"
];

export function shouldRetrieveMemory(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized.length >= 3 && CONTEXT_CUES.some((cue) => normalized.includes(cue));
}
