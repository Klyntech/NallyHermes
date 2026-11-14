import assert from "node:assert/strict";
import test from "node:test";
import { buildSkillContext, loadSkillMetadata, resetSkillCatalogForTests } from "../src/agent/skills/registry.js";

test("discovers repository skills from SKILL.md metadata", async () => {
  resetSkillCatalogForTests();
  const skills = await loadSkillMetadata();
  assert.ok(skills.some((skill) => skill.name === "nally-core"));
  assert.ok(skills.some((skill) => skill.name === "test-driven-development"));
  assert.ok(skills.every((skill) => skill.description.length > 20));
});

test("activates coding guidance for a coding request without loading unrelated bodies", async () => {
  resetSkillCatalogForTests();
  const context = await buildSkillContext("Debug the TypeScript repository bug and write tests");
  assert.match(context, /Active skill instructions:/);
  assert.match(context, /### nally-core/);
  assert.match(context, /### systematic-debugging/);
  assert.match(context, /### test-driven-development/);
  assert.doesNotMatch(context, /### telegram-voice-production\n/);
});

test("activates proven document guidance for prose work", async () => {
  resetSkillCatalogForTests();
  const context = await buildSkillContext("Rewrite this email in a concise professional tone");
  assert.match(context, /### internal-comms/);
});
