import assert from "node:assert/strict";
import { test } from "node:test";
import { buildElevenLabsEndOfStream } from "../src/mobile/elevenLabsStream.js";
import { isBargeInSpeech, PcmPacer, type PacerClock } from "../src/mobile/voicePlayback.js";

function fakeClock() {
  let now = 1_000;
  let nextId = 1;
  const timers: Array<{ id: number; at: number; run: () => void }> = [];
  const clock: PacerClock = {
    now: () => now,
    setTimer: (run, ms) => {
      const id = nextId++;
      timers.push({ id, at: now + ms, run });
      return id;
    },
    clearTimer: (handle) => {
      const index = timers.findIndex((timer) => timer.id === handle);
      if (index >= 0) timers.splice(index, 1);
    }
  };
  return {
    clock,
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        now = next.at;
        next.run();
      }
      now = end;
    }
  };
}

const HALF_SECOND = Buffer.alloc(16_000); // 500 ms of 16 kHz mono PCM16

test("pacer sends a bounded lead immediately, then releases audio at real-time pace", () => {
  const { clock, advance } = fakeClock();
  const sent: Buffer[] = [];
  const pacer = new PcmPacer((chunk) => sent.push(chunk), 1_000, clock);
  for (let i = 0; i < 10; i++) pacer.push(HALF_SECOND);
  assert.equal(sent.length, 3);
  advance(500);
  assert.equal(sent.length, 4);
  advance(1_000);
  assert.equal(sent.length, 6);
  advance(10_000);
  assert.equal(sent.length, 10);
  assert.equal(pacer.queuedBytes, 0);
});

test("whenDrained runs only after the last queued chunk has been emitted", () => {
  const { clock, advance } = fakeClock();
  let drained = 0;
  const sent: Buffer[] = [];
  const pacer = new PcmPacer((chunk) => sent.push(chunk), 1_000, clock);
  for (let i = 0; i < 5; i++) pacer.push(HALF_SECOND);
  pacer.whenDrained(() => drained++);
  assert.equal(drained, 0);
  advance(10_000);
  assert.equal(sent.length, 5);
  assert.equal(drained, 1);
  pacer.whenDrained(() => drained++);
  assert.equal(drained, 2);
});

test("clear drops queued audio and discards drain callbacks (barge-in)", () => {
  const { clock, advance } = fakeClock();
  let drained = 0;
  const sent: Buffer[] = [];
  const pacer = new PcmPacer((chunk) => sent.push(chunk), 1_000, clock);
  for (let i = 0; i < 10; i++) pacer.push(HALF_SECOND);
  pacer.whenDrained(() => drained++);
  pacer.clear();
  advance(20_000);
  assert.equal(sent.length, 3);
  assert.equal(drained, 0);
  assert.equal(pacer.queuedBytes, 0);
});

test("pacer restarts its playback clock after the client underruns", () => {
  const { clock, advance } = fakeClock();
  const sent: Buffer[] = [];
  const pacer = new PcmPacer((chunk) => sent.push(chunk), 1_000, clock);
  pacer.push(HALF_SECOND);
  advance(5_000);
  pacer.push(HALF_SECOND);
  pacer.push(HALF_SECOND);
  assert.equal(sent.length, 3);
});

test("barge-in ignores echo/noise blips but accepts real speech and short explicit interrupts", () => {
  assert.equal(isBargeInSpeech("", 6), false);
  assert.equal(isBargeInSpeech("uh", 6), false);
  assert.equal(isBargeInSpeech("the", 6), false);
  assert.equal(isBargeInSpeech(",.", 6), false);
  assert.equal(isBargeInSpeech("stop", 6), true);
  assert.equal(isBargeInSpeech("Wait a second", 6), true);
  assert.equal(isBargeInSpeech("what time is it", 6), true);
});

test("end-of-stream message is the documented empty text that finishes and closes the provider socket", () => {
  assert.deepEqual(buildElevenLabsEndOfStream(), { text: "" });
});
