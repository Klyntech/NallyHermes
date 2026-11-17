import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { appendSourcesFooter, extractAnswerSources } from "../src/agent/sourceAttribution.js";

function toolMessages(name: string, id: string, content: unknown): ChatCompletionMessageParam[] {
  return [
    {
      role: "assistant",
      content: null,
      tool_calls: [{ id, type: "function", function: { name, arguments: "{}" } }]
    },
    { role: "tool", tool_call_id: id, content: JSON.stringify(content) }
  ];
}

describe("answer source attribution", () => {
  it("extracts safe web search results and fetched pages without timestamps", () => {
    const messages = [
      ...toolMessages("web_search", "search-1", {
        searched_at: "2026-11-17T12:00:00Z",
        results: [
          { title: "Official Guide", url: "https://example.com/guide" },
          { title: "Duplicate guide", url: "https://example.com/guide#section" },
          { title: "Unsafe scheme", url: "javascript:alert(1)" },
          { title: "Insecure site", url: "http://example.com/page" }
        ]
      }),
      ...toolMessages("fetch", "fetch-1", {
        url: "https://example.org/article",
        title: "Fetched Article",
        fetched_at: "2026-11-17T12:00:00Z",
        content: "..."
      })
    ];
    const sources = extractAnswerSources(messages);
    assert.deepEqual(sources.map((source) => source.title), ["Official Guide", "Fetched Article"]);
    assert.ok(sources.every((source) => source.url?.startsWith("https://")));
  });

  it("adds academic title and course as plain source labels", () => {
    const messages = toolMessages("academic", "academic-1", {
      sources: [{ document_id: "doc-1", title: "Contract Law Notes", course: "LAW 201", excerpt: "..." }]
    });
    const sources = extractAnswerSources(messages);
    assert.deepEqual(sources, [{
      kind: "academic",
      title: "Contract Law Notes",
      course: "LAW 201",
      documentId: "doc-1"
    }]);
  });

  it("replaces model-supplied timestamp/status metadata with a clickable natural footer", () => {
    const answer = [
      "Partial — Here is the verified answer.",
      "Source / Last checked: https://example.com (2026-11-17T12:00:00Z)",
      "",
      "**Sources**",
      "- hallucinated source"
    ].join("\n");
    const result = appendSourcesFooter(answer, [{
      kind: "web",
      title: "Official Article",
      url: "https://example.com/source"
    }]);
    assert.match(result, /^I could verify part of this: Here is the verified answer\./);
    assert.match(result, /\*\*Sources\*\*[\s\S]*\[Official Article\]\(https:\/\/example\.com\/source\)/);
    assert.doesNotMatch(result, /Last checked|2026-11-17|hallucinated|^Partial/m);
  });

  it("does not invent a Sources footer when no tool sources were returned", () => {
    assert.equal(appendSourcesFooter("A short answer.", []), "A short answer.");
  });

  it("keeps only real sources in a voice reply's text-only section", () => {
    const answer = appendSourcesFooter(
      "===SPOKEN===\nThe answer is verified.\n===TEXT===\n",
      [{ kind: "web", title: "Official Article", url: "https://example.com/source" }]
    );
    assert.match(answer, /===SPOKEN===[\s\S]*===TEXT===[\s\S]*\[Official Article\]/);
    assert.doesNotMatch(answer, /Last checked|retrieved at/i);
  });
});
