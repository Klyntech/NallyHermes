import assert from "node:assert/strict";
import test from "node:test";

const { formatContextPackForModel } = await import("../src/agent/contextPack.js");
const { composePartialAnswer } = await import("../src/agent/partial.js");
const { SPOKEN_STYLE_GUIDANCE, toVoiceResponse } = await import("../src/agent/orchestra.js");
const { isVoiceConfigured } = await import("../src/agent/voice/index.js");

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

test("partial composer works with no findings", () => {
  const text = composePartialAnswer({ reason: "Provider rate limited" });
  assert.match(text, /temporary|provider|network|rate/i);
});

test("spoken style guidance stresses short speakable answers", () => {
  assert.match(SPOKEN_STYLE_GUIDANCE, /speech/i);
  assert.match(SPOKEN_STYLE_GUIDANCE, /short sentences/i);
  assert.match(SPOKEN_STYLE_GUIDANCE, /tables/i);
});

test("toVoiceResponse clips long text for TTS", () => {
  const out = toVoiceResponse("A".repeat(2000), { maxChars: 100 });
  assert.ok(out.text.length <= 110);
  assert.equal(out.speak, true);
});

test("isVoiceConfigured reflects env without throwing", () => {
  assert.equal(typeof isVoiceConfigured(), "boolean");
});
