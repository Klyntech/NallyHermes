import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditFactualAnswer } from "../src/agent/evaluator.js";
import { classifySourceTier, planSearchQueries } from "../src/agent/tools/web.js";

describe("accuracy contract — claim audit", () => {
  it("passes a short non-factual reply", () => {
    const result = auditFactualAnswer("Yeah, that one hurts. What happened?");
    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 0);
  });

  it("flags approximate numbers", () => {
    const result = auditFactualAnswer("NallyHermes has ~24 commits on main.");
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "approx_number"));
  });

  it("flags not disclosed language", () => {
    const result = auditFactualAnswer("Pricing is not separately disclosed for this tier.");
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "not_disclosed_language"));
  });

  it("flags tables without proof", () => {
    const table = [
      "| Model | Price |",
      "| --- | --- |",
      "| Opus 5.5 | $4 / $20 |",
      "| Sonnet 5.5 | $2 / $10 |"
    ].join("\n");
    const result = auditFactualAnswer(table, { hadResearchTools: true });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "table_without_proof"));
  });

  it("accepts tables with source line", () => {
    const table = [
      "| Model | Price | Source |",
      "| --- | --- | --- |",
      "| Opus 5.5 | $4 / $20 | https://www.anthropic.com/pricing |",
      "",
      "**Source / Last checked:** https://www.anthropic.com/pricing (2026-11-13T10:00:00Z)"
    ].join("\n");
    const result = auditFactualAnswer(table, { hadResearchTools: true });
    assert.equal(result.ok, true, result.issues.map((i) => i.code).join(","));
  });

  it("flags numeric tables without research tools", () => {
    const table = [
      "| Repo | Commits |",
      "| --- | --- |",
      "| NallyHermes | 120 |",
      "",
      "**Source / Last checked:** none"
    ].join("\n");
    const result = auditFactualAnswer(table, { hadResearchTools: false });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "numeric_without_evidence"));
  });
});

describe("accuracy contract — source tiering", () => {
  it("marks vendor docs primary", () => {
    assert.equal(classifySourceTier("https://www.anthropic.com/pricing"), "primary");
    assert.equal(classifySourceTier("https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html"), "primary");
    assert.equal(classifySourceTier("https://github.com/Klyntech/NallyHermes"), "primary");
  });

  it("marks known aggregators", () => {
    assert.equal(classifySourceTier("https://www.taskade.com/blog/ai-models"), "aggregator");
  });
});

describe("accuracy contract — query planner", () => {
  it("returns the original query when not research", () => {
    assert.deepEqual(planSearchQueries("weather in Lagos", false), ["weather in Lagos"]);
  });

  it("adds primary-biased variants for research pricing queries", () => {
    const variants = planSearchQueries("Anthropic Opus 5.5 pricing", true);
    assert.ok(variants.length >= 2);
    assert.ok(variants.some((q) => /anthropic\.com/i.test(q) || /official/i.test(q)));
  });
});
