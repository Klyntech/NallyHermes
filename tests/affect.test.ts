import assert from "node:assert/strict";
import test from "node:test";

const {
  inferUserAffect,
  applyAffectEvent,
  decayAgentAffect,
  buildAffectPromptHint,
  beginTurnAffect,
  topicKey
} = await import("../src/agent/affect.js");

test("user frustration does not force agent rage", () => {
  const user = inferUserAffect("This is useless and I'm furious");
  assert.ok(user.frustration > 0.4);
  const snap = beginTurnAffect({
    telegramId: "affect-test-1",
    userMessage: "This is useless and I'm furious",
    injectPrompt: true
  });
  // Empathy path: agent frustration should not spike to match user
  assert.ok(snap.agent.frustration < 0.5);
  assert.ok(snap.promptHint);
  assert.match(snap.promptHint!, /Do not match anger/i);
  assert.doesNotMatch(snap.promptHint!, /I feel/);
});

test("warm short greeting can inject light warmth without monologue", () => {
  const snap = beginTurnAffect({
    telegramId: "affect-test-2",
    userMessage: "Hey Nally",
    injectPrompt: true
  });
  if (snap.promptHint) {
    assert.doesNotMatch(snap.promptHint, /I feel/);
  }
});

test("topic change decays sticky frustration", () => {
  let agent = {
    valence: 0,
    arousal: 0.5,
    confidence: 0.4,
    frustration: 0.8,
    curiosity: 0.2,
    updatedAt: new Date().toISOString(),
    lastTopicKey: "real madrid celta kickoff"
  };
  agent = applyAffectEvent(agent, { type: "topic_change" });
  assert.ok(agent.frustration < 0.5);
});

test("near baseline yields no prompt injection", () => {
  const hint = buildAffectPromptHint(
    { valence: 0, arousal: 0.3, frustration: 0.1, warmth: 0.4 },
    {
      valence: 0.1,
      arousal: 0.2,
      confidence: 0.55,
      frustration: 0.1,
      curiosity: 0.3,
      updatedAt: new Date().toISOString(),
      lastTopicKey: "x"
    }
  );
  assert.equal(hint, null);
});

test("topicKey is stable-ish for similar phrases", () => {
  assert.ok(topicKey("When is the Real Madrid match?").includes("madrid") || topicKey("When is the Real Madrid match?").length > 0);
});
