import assert from "node:assert/strict";
import test from "node:test";

const { requiresAcademicSourceCheck } = await import("../src/agent/academicSourceGate.js");

test("explicit library provenance questions require an academic lookup", () => {
  assert.equal(requiresAcademicSourceCheck("Are these sections from my library? Yes or no."), true);
  assert.equal(requiresAcademicSourceCheck("Is that in my lecture notes?"), true);
  assert.equal(requiresAcademicSourceCheck("Did you use my uploaded PDFs?"), true);
  assert.equal(requiresAcademicSourceCheck("Was that based on the course readings?"), true);
  assert.equal(requiresAcademicSourceCheck("What do my lecture notes say about section 36?"), true);
});

test("general questions do not force a library lookup", () => {
  assert.equal(requiresAcademicSourceCheck("Explain presumption of innocence."), false);
  assert.equal(requiresAcademicSourceCheck("Search the web for the latest case law."), false);
  assert.equal(requiresAcademicSourceCheck("Can you remember my preferred writing style?"), false);
});
