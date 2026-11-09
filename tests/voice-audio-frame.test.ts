import test from "node:test";
import assert from "node:assert/strict";

function parseInputFrame(frame: Buffer): Buffer {
  if (frame.length < 18 || frame.toString("ascii", 0, 4) !== "NLYA" ||
      frame[4] !== 1 || frame[5] !== 1 || frame[6] !== 0 || frame[7] !== 0 ||
      (frame.length - 16) % 2 !== 0) throw new Error("Invalid frame");
  if (frame.readUInt32BE(8) !== 0 || frame.readUInt32BE(12) !== 0) throw new Error("Invalid ids");
  return frame.subarray(16);
}

test("voice input frame validates v1 PCM16 and strips header", () => {
  const frame = Buffer.alloc(20);
  frame.write("NLYA", 0, "ascii");
  frame[4] = 1; frame[5] = 1;
  frame.writeInt16LE(1234, 16);
  assert.deepEqual(parseInputFrame(frame), frame.subarray(16));
});

test("voice input frame rejects nonzero client turn identifiers", () => {
  const frame = Buffer.alloc(18);
  frame.write("NLYA", 0, "ascii");
  frame[4] = 1; frame[5] = 1;
  frame.writeUInt32BE(1, 8);
  assert.throws(() => parseInputFrame(frame));
});
