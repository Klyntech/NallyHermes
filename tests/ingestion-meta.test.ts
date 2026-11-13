import assert from "node:assert/strict";
import test from "node:test";

const { parseIngestionCaption, formatIngestionGuidance } = await import("../src/telegram/ingestionMeta.js");

test("parseIngestionCaption uses structured Course and Title fields", () => {
  const meta = parseIngestionCaption("Course: Tort | Title: Negligence lecture 3", "ignored.pdf");
  assert.equal(meta.title, "Negligence lecture 3");
  assert.equal(meta.course, "Tort");
  assert.equal(meta.fromCaption, true);
});

test("parseIngestionCaption falls back to filename when caption is empty", () => {
  const meta = parseIngestionCaption("", "Negligence-notes.pdf");
  assert.equal(meta.title, "Negligence-notes");
  assert.equal(meta.course, undefined);
  assert.equal(meta.fromCaption, false);
});

test("parseIngestionCaption accepts free-form first line as title", () => {
  const meta = parseIngestionCaption("Negligence overview\nextra context", "file.pdf");
  assert.equal(meta.title, "Negligence overview");
  assert.equal(meta.notes, "extra context");
  assert.equal(meta.fromCaption, true);
});

test("formatIngestionGuidance mentions reply labeling", () => {
  const text = formatIngestionGuidance("notes.pdf");
  assert.match(text, /reply/i);
  assert.match(text, /Course:/);
});
