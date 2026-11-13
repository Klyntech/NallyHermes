/**
 * Telegram document metadata helpers for academic ingestion.
 *
 * Goal: decouple caption / label capture from upload completion so a document
 * can be stored from the raw file while title, course, and other context can
 * still be attached from the same message caption or a short follow-up message.
 */

export interface IngestionMetadata {
  title: string;
  course?: string;
  notes?: string;
  /** True when the user supplied structured or free-form caption text beyond the filename. */
  fromCaption: boolean;
}

const COURSE_RE = /(?:^|\|\s*|\n\s*)course\s*[:=]\s*([^|\n]+)/i;
const TITLE_RE = /(?:^|\|\s*|\n\s*)title\s*[:=]\s*([^|\n]+)/i;
const NOTES_RE = /(?:^|\|\s*|\n\s*)notes?\s*[:=]\s*([^|\n]+)/i;

function cleanSegment(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\s+/g, " ");
  return trimmed && trimmed.length > 0 ? trimmed.slice(0, 240) : undefined;
}

/**
 * True when the message is clearly a document-label instruction, not ordinary chat.
 * Used so a follow-up without Telegram reply-to still enriches the latest pending PDF.
 */
export function looksLikeStructuredLabel(text: string | undefined | null): boolean {
  const raw = (text ?? "").trim();
  if (!raw || raw.length > 500) return false;
  const hasCourse = COURSE_RE.test(raw);
  const hasTitle = TITLE_RE.test(raw);
  return hasCourse || hasTitle;
}

/**
 * Parse caption (or a follow-up label message) into structured ingestion metadata.
 * Accepts both structured forms (`Course: Tort | Title: Negligence`) and a free-form
 * first line used as title when no explicit Title: field is present.
 */
export function parseIngestionCaption(
  caption: string | undefined | null,
  fileName: string | undefined | null
): IngestionMetadata {
  const raw = (caption ?? "").trim();
  const fallbackTitle =
    cleanSegment(fileName?.replace(/\.pdf$/i, "")) || "Academic PDF";

  if (!raw) {
    return { title: fallbackTitle, fromCaption: false };
  }

  const course = cleanSegment(raw.match(COURSE_RE)?.[1]);
  const explicitTitle = cleanSegment(raw.match(TITLE_RE)?.[1]);
  const notes = cleanSegment(raw.match(NOTES_RE)?.[1]);

  if (explicitTitle || course) {
    return {
      title: explicitTitle || fallbackTitle,
      course,
      notes,
      fromCaption: true
    };
  }

  // Free-form caption: first non-empty line is the title; remainder is notes.
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title = cleanSegment(lines[0]) || fallbackTitle;
  const remainder = lines.slice(1).join(" ").trim();
  return {
    title,
    notes: remainder ? remainder.slice(0, 500) : undefined,
    fromCaption: true
  };
}

export function formatIngestionGuidance(fileName?: string): string {
  const nameHint = fileName ? ` for “${fileName}”` : "";
  return [
    `I stored the PDF${nameHint}.`,
    "To label it, send (or reply with):",
    "`Course: Tort | Title: Negligence lecture 3`",
    "A short free-form title also works."
  ].join("\n");
}
