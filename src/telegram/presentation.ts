const TELEGRAM_TEXT_LIMIT = 4096;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|blockquote|pre|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
}

function splitText(value: string): string[] {
  const parts: string[] = [];
  let rest = value;
  while (rest.length > TELEGRAM_TEXT_LIMIT) {
    let at = rest.lastIndexOf("\n", TELEGRAM_TEXT_LIMIT);
    if (at < TELEGRAM_TEXT_LIMIT / 2) at = rest.lastIndexOf(" ", TELEGRAM_TEXT_LIMIT);
    if (at < TELEGRAM_TEXT_LIMIT / 2) at = TELEGRAM_TEXT_LIMIT;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function replyFormatted(
  reply: (text: string, options?: { parse_mode?: "HTML" }) => Promise<unknown>,
  html: string
): Promise<void> {
  if (html.length <= TELEGRAM_TEXT_LIMIT) {
    try {
      await reply(html, { parse_mode: "HTML" });
      return;
    } catch (error) {
      console.warn("Telegram HTML formatting failed; falling back to plain text:", error);
    }
  }

  const plain = toPlainText(html) || "I could not format that response.";
  for (const part of splitText(plain)) {
    await reply(escapeHtml(part), { parse_mode: "HTML" });
  }
}

export async function editFormatted(
  edit: (text: string, options?: { parse_mode?: "HTML" }) => Promise<unknown>,
  reply: (text: string, options?: { parse_mode?: "HTML" }) => Promise<unknown>,
  html: string
): Promise<void> {
  if (html.length <= TELEGRAM_TEXT_LIMIT) {
    try {
      await edit(html, { parse_mode: "HTML" });
      return;
    } catch (error) {
      console.warn("Telegram HTML edit failed; falling back to plain text:", error);
    }
  }

  const plain = toPlainText(html) || "I could not format that response.";
  const parts = splitText(plain);
  if (parts.length) {
    await edit(escapeHtml(parts[0]!), { parse_mode: "HTML" });
    for (const part of parts.slice(1)) {
      await reply(escapeHtml(part), { parse_mode: "HTML" });
    }
  }
}
