import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeForSpeech, SpeechChunker, SpokenStreamParser } from "../src/mobile/voiceSpeech.js";

function parseAll(deltas: string[]): { spoken: string; structured: boolean } {
  const parser = new SpokenStreamParser();
  let spoken = "";
  for (const d of deltas) spoken += parser.feed(d);
  spoken += parser.finish();
  return { spoken, structured: parser.structured };
}

test("parser speaks only the SPOKEN block and stops at the TEXT marker", () => {
  const out = parseAll(["===SPOKEN===\nIt is sunny.", " Bring shades.\n===TEXT===\n| table |"]);
  assert.equal(out.spoken.trim(), "It is sunny. Bring shades.");
  assert.equal(out.structured, true);
});

test("parser handles markers split across deltas", () => {
  const out = parseAll(["==", "=SPO", "KEN===\nHello th", "ere.\n=", "==TE", "XT===\nignored"]);
  assert.equal(out.spoken.trim(), "Hello there.");
});

test("parser speaks marker-free replies immediately", () => {
  const parser = new SpokenStreamParser();
  assert.equal(parser.feed("Sure, "), "Sure, ");
  assert.equal(parser.feed("one moment."), "one moment.");
  assert.equal(parser.finish(), "");
  assert.equal(parser.structured, false);
});

test("parser keeps a spoken preamble and drops a later SPOKEN marker", () => {
  const out = parseAll(["Let me check. ", "===SPOKEN===\nYou are free at three.", "\n===TEXT===\n"]);
  assert.equal(out.spoken.replace(/\s+/g, " ").trim(), "Let me check. You are free at three.");
});

test("parser does not swallow a lone equals sign in speech", () => {
  const out = parseAll(["Two plus two ", "= four."]);
  assert.equal(out.spoken, "Two plus two = four.");
});

test("parser drops an unfinished marker at the end of the stream", () => {
  assert.equal(parseAll(["Done.\n==="]).spoken.trim(), "Done.");
});

test("sanitizer removes links and markdown but keeps link text", () => {
  assert.equal(sanitizeForSpeech("See [the docs](https://x.dev/a) and https://y.com now."), "See the docs and now.");
  assert.equal(sanitizeForSpeech("**Bold** and `code`"), "Bold and code");
  assert.equal(sanitizeForSpeech("- one\n- two"), "one two");
});

test("chunker speaks the first sentence immediately, then groups later ones", () => {
  const chunker = new SpeechChunker({ minChars: 30 });
  assert.deepEqual(chunker.push("Sure. "), ["Sure."]);
  assert.deepEqual(chunker.push("It is 20 degrees. "), []);
  const next = chunker.push("Rain is likely this evening. ");
  assert.deepEqual(next, ["It is 20 degrees. Rain is likely this evening."]);
  assert.deepEqual(chunker.flush(), []);
});

test("chunker does not split on abbreviations or decimals", () => {
  const chunker = new SpeechChunker({ minChars: 5 });
  const out = [...chunker.push("Dr. Lee paid 3.5 dollars today. Then left. "), ...chunker.flush()];
  assert.deepEqual(out, ["Dr. Lee paid 3.5 dollars today.", "Then left."]);
});

test("chunker cuts a long first sentence at a clause so audio can start early", () => {
  const chunker = new SpeechChunker({ firstClauseChars: 40 });
  const text = "Well, the weather in Lisbon tomorrow looks pretty good overall, with some clouds in the morning and sun later";
  const out = chunker.push(text);
  assert.equal(out.length, 1);
  assert.ok(out[0]!.endsWith(","));
  assert.ok(out[0]!.length >= 40);
});

test("chunker flushes the tail and stops at the total cap", () => {
  const chunker = new SpeechChunker({ maxTotalChars: 40, minChars: 1 });
  const out = [
    ...chunker.push("First sentence is here. Second sentence is here. Third sentence is here. "),
    ...chunker.flush()
  ];
  assert.deepEqual(out, ["First sentence is here.", "Second sentence is here."]);
  assert.deepEqual(chunker.push("More text. "), []);
});

test("chunker flush speaks unterminated text", () => {
  const chunker = new SpeechChunker();
  assert.deepEqual(chunker.push("Almost there"), []);
  assert.deepEqual(chunker.flush(), ["Almost there"]);
});
