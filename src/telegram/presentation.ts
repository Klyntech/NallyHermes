const TELEGRAM_TEXT_LIMIT = 4096;
/** Rich messages allow up to 32768 UTF-8 characters; keep a safety margin. */
const TELEGRAM_RICH_LIMIT = 30_000;

export type InputRichMessageMarkdown = { markdown: string };

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

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/g).map((part) => part.trim().replace(/\\\|/g, "|"));
}

function isTableSeparator(line: string): boolean {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

/** Align markdown table rows into fixed-width plain text (ported from Nally.com telegram renderer). */
function tableText(lines: string[]): string {
  const parsed = lines.map(tableCells);
  const headers = parsed[0] ?? [];
  const body = parsed.length > 1 && isTableSeparator(lines[1]!) ? parsed.slice(2) : parsed.slice(1);
  const count = Math.max(headers.length, ...body.map((row) => row.length), 1);
  const rows = [
    [...headers, ...Array(Math.max(0, count - headers.length)).fill("")],
    ...body.map((row) => [...row, ...Array(Math.max(0, count - row.length)).fill("")])
  ];
  const widths = Array.from({ length: count }, (_, i) =>
    Math.min(32, Math.max(3, ...rows.map((row) => String(row[i] ?? "").length)))
  );

  const fmt = (row: string[]) =>
    row
      .map((value, i) => {
        let cell = String(value).replace(/\s+/g, " ");
        if (cell.length > widths[i]!) cell = cell.slice(0, widths[i]! - 1) + "…";
        return cell.padEnd(widths[i]!);
      })
      .join("  ")
      .trimEnd();

  return [fmt(rows[0]!), widths.map((w) => "-".repeat(w)).join("  "), ...rows.slice(1).map(fmt)].join("\n");
}

/** Convert GFM pipe tables into fenced preformatted blocks so Telegram keeps column alignment. */
export function tablesToFences(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const result: string[] = [];
  let i = 0;
  let inFence = false;

  while (i < lines.length) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      result.push(line);
      i += 1;
      continue;
    }
    if (!inFence && i + 1 < lines.length && line.includes("|") && isTableSeparator(lines[i + 1]!)) {
      const table = [line, lines[i + 1]!];
      i += 2;
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim()) {
        table.push(lines[i]!);
        i += 1;
      }
      result.push("```text", tableText(table), "```");
      continue;
    }
    result.push(line);
    i += 1;
  }
  return result.join("\n");
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
  value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (match, label: string, href: string) => {
    const safe = safeLink(href);
    return safe ? protect(`<a href="${safe}">${escapeHtml(label)}</a>`) : match;
  });
  value = escapeHtml(value)
    .replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/__(.+?)__/g, "<b>$1</b>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<i>$2</i>");
  return value.replace(/\u0000PART(\d+)\u0000/g, (_match, index: string) => protectedParts[Number(index)] ?? "");
}

/** Converts the Markdown emitted by the agent into Telegram's supported HTML subset (legacy fallback). */
export function markdownToTelegramHtml(markdown: string): string {
  const lines = tablesToFences(markdown).replace(/\r\n?/g, "\n").split("\n");
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
    const match = token.match(/^<(b|i|s|code|pre|blockquote|a)(?:\s+[^>]*)?>$/i);
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
    const closeMatch = token.match(/^<\/(b|i|s|code|pre|blockquote|a)>$/i);
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

/** Legacy HTML send path used when rich messages are unavailable. */
export type TelegramSendHtml = (text: string, options?: { parse_mode?: "HTML" }) => Promise<unknown>;

/** Bot API 10.1+ rich message send (native headings, lists, tables via markdown). */
export type TelegramSendRich = (rich_message: InputRichMessageMarkdown) => Promise<unknown>;

export type TelegramReplyTransport = {
  /** Prefer this when the Bot API / client supports sendRichMessage. */
  rich?: TelegramSendRich;
  /** Always provided; used as fallback and for oversize payloads. */
  html: TelegramSendHtml;
};

export type TelegramEditTransport = {
  rich?: TelegramSendRich;
  html: TelegramSendHtml;
};

function normalizeMarkdown(markdown: string): string {
  const body = markdown.replace(/\r\n?/g, "\n").trim();
  return body || " ";
}

async function sendHtmlChunks(send: TelegramSendHtml, markdown: string): Promise<void> {
  const html = markdownToTelegramHtml(markdown);
  try {
    for (const part of splitHtml(html || " ")) {
      await send(part, { parse_mode: "HTML" });
    }
  } catch (error) {
    console.warn("Telegram HTML formatting failed; falling back to plain text:", error);
    for (const part of splitPlainText(toPlainText(html) || markdown)) {
      await send(escapeHtml(part), { parse_mode: "HTML" });
    }
  }
}

/**
 * Deliver agent Markdown to Telegram.
 * Prefers Bot API rich messages (`rich_message.markdown`) so headings, lists,
 * and tables render natively. Falls back to the HTML converter + 4096 splitting.
 */
export async function replyFormatted(transport: TelegramReplyTransport | TelegramSendHtml, markdown: string): Promise<void> {
  const body = normalizeMarkdown(markdown);
  const send: TelegramReplyTransport =
    typeof transport === "function" ? { html: transport } : transport;

  if (send.rich && body.length <= TELEGRAM_RICH_LIMIT) {
    try {
      await send.rich({ markdown: body });
      return;
    } catch (error) {
      console.warn("Telegram rich message failed; falling back to HTML:", error);
    }
  }

  await sendHtmlChunks(send.html, body);
}

/**
 * Replace a progress message with the final answer.
 * Tries rich_message on edit first, then HTML; extra chunks are sent as new messages.
 */
export async function editFormatted(
  edit: TelegramEditTransport | TelegramSendHtml,
  reply: TelegramReplyTransport | TelegramSendHtml,
  markdown: string
): Promise<void> {
  const body = normalizeMarkdown(markdown);
  const editTransport: TelegramEditTransport = typeof edit === "function" ? { html: edit } : edit;
  const replyTransport: TelegramReplyTransport = typeof reply === "function" ? { html: reply } : reply;

  if (editTransport.rich && body.length <= TELEGRAM_RICH_LIMIT) {
    try {
      await editTransport.rich({ markdown: body });
      return;
    } catch (error) {
      console.warn("Telegram rich message edit failed; falling back to HTML:", error);
    }
  }

  const html = markdownToTelegramHtml(body);
  const parts = splitHtml(html || " ");
  try {
    await editTransport.html(parts[0]!, { parse_mode: "HTML" });
    for (const part of parts.slice(1)) {
      await replyTransport.html(part, { parse_mode: "HTML" });
    }
  } catch (error) {
    console.warn("Telegram HTML edit failed; falling back to plain text:", error);
    const plainParts = splitPlainText(toPlainText(html) || body);
    if (plainParts.length) {
      await editTransport.html(escapeHtml(plainParts[0]!), { parse_mode: "HTML" });
      for (const part of plainParts.slice(1)) {
        await replyTransport.html(escapeHtml(part), { parse_mode: "HTML" });
      }
    }
  }
}
