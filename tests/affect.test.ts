import assert from "node:assert/strict";
import test from "node:test";

const {
  inferUserAffect,
  applyAffectEvent,
  buildAffectPromptHint,
  beginTurnAffect,
  selectReplyPolicy,
  topicKey
} = await import("../src/agent/affect.js");

test("user frustration does not force agent rage", () => {
  const snap = beginTurnAffect({
    telegramId: "affect-test-1",
    userMessage: "This is useless and I'm furious",
    injectPrompt: true
  });
  assert.equal(snap.policy, "stress");
  assert.ok(snap.agent.frustration < 0.5);
  assert.ok(snap.promptHint);
  assert.match(snap.promptHint!, /policy=stress/);
  assert.match(snap.promptHint!, /Do not mirror anger/i);
  assert.doesNotMatch(snap.promptHint!, /that one hurts/i);
});

test("confusion policy prefers explain-then-check", () => {
  const user = inferUserAffect("I'm confused, I don't understand what you mean");
  assert.ok(user.confusion > 0.4);
  const policy = selectReplyPolicy(user, {
    valence: 0.1,
    arousal: 0.2,
    confidence: 0.55,
    frustration: 0.1,
    curiosity: 0.3,
    updatedAt: new Date().toISOString(),
    lastTopicKey: "x"
  });
  assert.equal(policy, "confuse");
  const hint = buildAffectPromptHint(user, {
    valence: 0.1,
    arousal: 0.2,
    confidence: 0.55,
    frustration: 0.1,
    curiosity: 0.3,
    updatedAt: new Date().toISOString(),
    lastTopicKey: "x"
  }, { policy });
  assert.match(hint!, /policy=confuse/);
  assert.match(hint!, /plain language/i);
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
    { valence: 0, arousal: 0.3, frustration: 0.1, warmth: 0.4, confusion: 0.1 },
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

test("topicKey is non-empty for normal phrases", () => {
  assert.ok(topicKey("When is the Real Madrid match?").length > 0);
});
