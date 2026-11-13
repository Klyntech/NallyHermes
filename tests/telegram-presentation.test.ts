import assert from "node:assert/strict";
import test from "node:test";
import { markdownToTelegramHtml, replyFormatted, tablesToFences } from "../src/telegram/presentation.js";

test("escapes user-controlled HTML instead of emitting raw tags", () => {
  const html = markdownToTelegramHtml("Hello <script>alert(1)</script> & goodbye");
  assert.equal(html, "Hello &lt;script&gt;alert(1)&lt;/script&gt; &amp; goodbye");
});

test("converts common Markdown formatting to Telegram HTML", () => {
  const html = markdownToTelegramHtml(
    "# Heading\n\n**bold** and *italic* and ~~removed~~\n\n- first\n- second"
  );
  assert.match(html, /^<b>Heading<\/b>/);
  assert.match(html, /<b>bold<\/b>/);
  assert.match(html, /<i>italic<\/i>/);
  assert.match(html, /<s>removed<\/s>/);
  assert.match(html, /• first\n• second/);
});

test("renders fenced code as escaped preformatted text", () => {
  const html = markdownToTelegramHtml("```html\n<div>safe & sound</div>\n```");
  assert.equal(html, "<pre><code>&lt;div&gt;safe &amp; sound&lt;/div&gt;</code></pre>");
});

test("does not create links for unsafe URL schemes", () => {
  const html = markdownToTelegramHtml("[click](javascript:alert(1))");
  assert.equal(html, "[click](javascript:alert(1))");
});

test("markdown tables become aligned preformatted text in HTML fallback", () => {
  const html = markdownToTelegramHtml(
    "| Name | Status |\n" +
    "| --- | --- |\n" +
    "| Nally | Ready |\n" +
    "| Worker | Pending |"
  );
  assert.match(html, /<pre><code>/);
  assert.match(html, /Name\s+Status/);
  assert.match(html, /Nally\s+Ready/);
  assert.doesNotMatch(html, /<table>/);
});

test("tablesToFences leaves existing fences alone", () => {
  const input = "```\n| not | a | table |\n```\n";
  assert.equal(tablesToFences(input), input.trimEnd() === input ? input : input);
  assert.match(tablesToFences(input), /```/);
});

test("splits long Telegram replies without exceeding the message limit", async () => {
  const sent: string[] = [];
  await replyFormatted(async (chunk) => { sent.push(chunk); }, "x".repeat(10_000));
  assert.ok(sent.length > 1);
  assert.ok(sent.every((chunk) => chunk.length <= 4096));
  assert.equal(sent.join(""), "x".repeat(10_000));
});

test("prefers rich message transport when provided", async () => {
  const richCalls: Array<{ markdown: string }> = [];
  const htmlCalls: string[] = [];
  const md = "# Title\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- item";
  await replyFormatted(
    {
      rich: async (payload) => { richCalls.push(payload); },
      html: async (text) => { htmlCalls.push(text); }
    },
    md
  );
  assert.equal(richCalls.length, 1);
  assert.equal(richCalls[0]!.markdown, md);
  assert.equal(htmlCalls.length, 0);
});

test("falls back to HTML when rich transport rejects", async () => {
  const htmlCalls: string[] = [];
  await replyFormatted(
    {
      rich: async () => { throw new Error("RICH_MESSAGE_UNSUPPORTED"); },
      html: async (text) => { htmlCalls.push(text); }
    },
    "**hello**"
  );
  assert.ok(htmlCalls.length >= 1);
  assert.match(htmlCalls[0]!, /<b>hello<\/b>/);
});
