const TELEGRAM_TEXT_LIMIT = 4096;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? escapeHtml(value) : undefined;
  } catch {
    return undefined;
  }
}

function renderInline(source: string): string {
  const protectedParts: string[] = [];
  const protect = (html: string) => {
    const index = protectedParts.push(html) - 1;
    return `\u0000PART${index}\u0000`;
  };

  let value = source.replace(/`([^`\n]+)`/g, (_match, text: string) =>
    protect("<code>" + escapeHtml(text) + "</code>")
  );
  value = escapeHtml(value);
  value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (match, label: string, href: string) => {
    const safe = safeLink(href);
    return safe ? protect(`<a href="${safe}">${label}</a>`) : match;
  });
  value = value
    .replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/__(.+?)__/g, "<b>$1</b>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<i>$2</i>");
  return value.replace(/\u0000PART(\d+)\u0000/g, (_match, index: string) => protectedParts[Number(index)] ?? "");
}

/** Converts the Markdown emitted by the agent into Telegram's supported HTML subset. */
export function markdownToTelegramHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  let paragraph: string[] = [];
  let codeLines: string[] | undefined;

  const flushParagraph = () => {
    if (paragraph.length) {
      output.push(renderInline(paragraph.join("\n")));
      paragraph = [];
    }
  };
  const flushCode = () => {
    if (codeLines) {
      output.push("<pre><code>" + escapeHtml(codeLines.join("\n")) + "</code></pre>");
      codeLines = undefined;
    }
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```[^\n]*$/);
    if (codeLines) {
      if (fence) flushCode();
      else codeLines.push(line);
      continue;
    }
    if (fence) {
      flushParagraph();
      codeLines = [];
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      output.push("<b>" + renderInline(heading[1]!) + "</b>");
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      output.push("<blockquote>" + renderInline(quote[1]!) + "</blockquote>");
      continue;
    }

    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const marker = unordered ? "• " : `${ordered![1]}. `;
      output.push(marker + renderInline((unordered ?? ordered)![unordered ? 1 : 2]!));
      continue;
    }

    paragraph.push(line);
  }

  flushCode();
  flushParagraph();
  return output.join("\n").trim();
}

function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:blockquote|pre)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

type HtmlTag = { name: string; open: string; close: string };

function splitHtml(html: string): string[] {
  const tokens = html.match(/<[^>]+>|[^<]+/g) ?? [];
  const chunks: string[] = [];
  const stack: HtmlTag[] = [];
  let current = "";

  const closing: Record<string, string> = {
    b: "</b>", i: "</i>", s: "</s>", code: "</code>", pre: "</pre>",
    blockquote: "</blockquote>", a: "</a>"
  };
  const opening = (token: string): HtmlTag | undefined => {
    const match = token.match(/^<(b|i|s|code|pre|blockquote|a)(?:\\s+[^>]*)?>$/i);
    if (!match) return undefined;
    const name = match[1]!.toLowerCase();
    return { name, open: token, close: closing[name]! };
  };
  const closeCurrent = () => {
    chunks.push(current + stack.slice().reverse().map((tag) => tag.close).join(""));
    current = stack.map((tag) => tag.open).join("");
  };
  const appendText = (text: string) => {
    for (const character of text) {
      const closingLength = stack.reduce((sum, tag) => sum + tag.close.length, 0);
      if (current.length + character.length + closingLength > TELEGRAM_TEXT_LIMIT && current !== stack.map((tag) => tag.open).join("")) {
        closeCurrent();
      }
      current += character;
    }
  };

  for (const token of tokens) {
    if (!token.startsWith("<")) {
      appendText(token);
      continue;
    }
    const closeMatch = token.match(/^<\\/(b|i|s|code|pre|blockquote|a)>$/i);
    const closeName = closeMatch?.[1]?.toLowerCase();
    const opened = opening(token);
    const closingLength = stack.reduce((sum, tag) => sum + tag.close.length, 0);
    if (current.length + token.length + closingLength > TELEGRAM_TEXT_LIMIT && current !== stack.map((tag) => tag.open).join("")) {
      closeCurrent();
    }
    current += token;
    if (opened) stack.push(opened);
    else if (closeName) {
      const index = stack.map((tag) => tag.name).lastIndexOf(closeName);
      if (index >= 0) stack.splice(index, 1);
    }
  }

  if (current && current !== stack.map((tag) => tag.open).join("")) {
    chunks.push(current + stack.slice().reverse().map((tag) => tag.close).join(""));
  }
  return chunks.filter(Boolean);
}

function splitPlainText(value: string): string[] {
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

type TelegramSend = (text: string, options?: { parse_mode?: "HTML" }) => Promise<unknown>;

export async function replyFormatted(reply: TelegramSend, markdown: string): Promise<void> {
  const html = markdownToTelegramHtml(markdown);
  try {
    for (const part of splitHtml(html || " ")) {
      await reply(part, { parse_mode: "HTML" });
    }
  } catch (error) {
    console.warn("Telegram HTML formatting failed; falling back to plain text:", error);
    for (const part of splitPlainText(toPlainText(html) || markdown)) {
      await reply(escapeHtml(part), { parse_mode: "HTML" });
    }
  }
}

export async function editFormatted(
  edit: TelegramSend,
  reply: TelegramSend,
  markdown: string
): Promise<void> {
  const html = markdownToTelegramHtml(markdown);
  const parts = splitHtml(html || " ");
  try {
    await edit(parts[0]!, { parse_mode: "HTML" });
    for (const part of parts.slice(1)) await reply(part, { parse_mode: "HTML" });
  } catch (error) {
    console.warn("Telegram HTML edit failed; falling back to plain text:", error);
    const plainParts = splitPlainText(toPlainText(html) || markdown);
    if (plainParts.length) {
      await edit(escapeHtml(plainParts[0]!), { parse_mode: "HTML" });
      for (const part of plainParts.slice(1)) await reply(escapeHtml(part), { parse_mode: "HTML" });
    }
  }
}
