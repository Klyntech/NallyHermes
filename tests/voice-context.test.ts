import assert from "node:assert/strict";
import test from "node:test";

const { formatContextPackForModel } = await import("../src/agent/contextPack.js");
const { composePartialAnswer } = await import("../src/agent/partial.js");
const { SPOKEN_STYLE_GUIDANCE, toVoiceResponse } = await import("../src/agent/orchestra.js");
const { isVoiceConfigured, splitSpokenChannelReply } = await import("../src/agent/voice/index.js");
const { stripUnspeakable } = await import("../src/agent/voice/spokenSplit.js");

test("context pack formats entity continuity hints for the model", () => {
  const text = formatContextPackForModel({
    telegramId: "1",
    channel: "voice",
    responseStyle: "spoken",
    userMessage: "When is our next match?",
    activeTopic: "When is our next match?",
    entities: [{ subject: "Real Madrid", predicate: "favorite_club", object: null, kind: "entity" }],
    preferences: ["Prefers concise answers"],
    commitments: [],
    facts: [],
    connectors: [
      { id: "web_search", available: true },
      { id: "voice", available: true }
    ],
    latencyBudgetMs: 60_000,
    risk: "low",
    complexityHint: "simple",
    builtAt: new Date().toISOString()
  });
  assert.match(text, /Real Madrid/);
  assert.match(text, /channel=voice/);
  assert.match(text, /connectors_available=web_search,voice/);
});

test("partial composer is honest about timeouts and keeps findings", () => {
  const text = composePartialAnswer({
    reason: "Request timed out while calling web_search",
    outcomes: [{ status: "completed", task: "Search scores", answer: "Barcelona leads 1-0." }]
  });
  assert.match(text, /Barcelona leads/);
  assert.match(text, /time limit/i);
});

test("spoken style guidance requires dual SPOKEN and TEXT sections", () => {
  assert.match(SPOKEN_STYLE_GUIDANCE, /===SPOKEN===/);
  assert.match(SPOKEN_STYLE_GUIDANCE, /===TEXT===/);
  assert.match(SPOKEN_STYLE_GUIDANCE, /Never read URLs/i);
});

test("splitSpokenChannelReply parses structured dual output", () => {
  const raw = [
    "===SPOKEN===",
    "Barcelona leads one nil. Sources are in the text.",
    "===TEXT===",
    "Source / Last checked: https://example.com/match (2026-11-13)"
  ].join("\n");
  const split = splitSpokenChannelReply(raw);
  assert.equal(split.structured, true);
  assert.match(split.spoken, /Barcelona/);
  assert.doesNotMatch(split.spoken, /https?:\/\//);
  assert.match(split.text, /example\.com/);
});

test("empty TEXT section stays empty", () => {
  const raw = [
    "===SPOKEN===",
    "Reminder set for nine tonight.",
    "===TEXT===",
    ""
  ].join("\n");
  const split = splitSpokenChannelReply(raw);
  assert.equal(split.spoken.includes("Reminder"), true);
  assert.equal(split.text, "");
});

test("splitSpokenChannelReply strips links from unstructured answers", () => {
  const split = splitSpokenChannelReply(
    "Price is four dollars per million. See https://anthropic.com/pricing for details."
  );
  assert.equal(split.structured, false);
  assert.doesNotMatch(split.spoken, /https?:\/\//);
  assert.match(split.text, /anthropic\.com/);
});

test("stripUnspeakable removes urls", () => {
  assert.equal(stripUnspeakable("Go to https://x.com now").includes("https"), false);
});

test("toVoiceResponse clips long text for TTS", () => {
  const out = toVoiceResponse("A".repeat(2000), { maxChars: 100 });
  assert.ok(out.text.length <= 110);
  assert.equal(out.speak, true);
});

test("isVoiceConfigured reflects env without throwing", () => {
  assert.equal(typeof isVoiceConfigured(), "boolean");
});
