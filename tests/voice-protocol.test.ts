import assert from "node:assert/strict";
import test from "node:test";
import {
  isMobileVoiceAudioFrame,
  MOBILE_VOICE_MAX_AUDIO_FRAME_BYTES,
  parseMobileVoiceControl
} from "../src/mobile/voiceProtocol.js";

test("voice protocol accepts a versioned start message and bounded language hint", () => {
  assert.deepEqual(parseMobileVoiceControl('{"type":"start","protocolVersion":1,"language":"en-US"}'), {
    ok: true,
    value: { type: "start", protocolVersion: 1, language: "en-US" }
  });
});

test("voice protocol rejects unsupported versions and malformed control data", () => {
  assert.deepEqual(parseMobileVoiceControl('{"type":"start","protocolVersion":2}'), {
    ok: false,
    code: "unsupported_protocol"
  });
  assert.deepEqual(parseMobileVoiceControl("{"), { ok: false, code: "invalid_json" });
  assert.deepEqual(parseMobileVoiceControl('{"type":"start","protocolVersion":1,"language":"' + "x".repeat(36) + '"}'), {
    ok: false,
    code: "invalid_message"
  });
  assert.deepEqual(parseMobileVoiceControl('{"type":"anything"}'), {
    ok: false,
    code: "invalid_message"
  });
});

test("voice control parser allows only known control messages", () => {
  for (const type of ["stop_input", "interrupt", "close", "ping"]) {
    assert.deepEqual(parseMobileVoiceControl(JSON.stringify({ type })), {
      ok: true,
      value: { type }
    });
  }
});

test("binary audio frames must be non-empty, even-length PCM and size bounded", () => {
  assert.equal(isMobileVoiceAudioFrame(new Uint8Array([0, 0])), true);
  assert.equal(isMobileVoiceAudioFrame(new Uint8Array()), false);
  assert.equal(isMobileVoiceAudioFrame(new Uint8Array([0])), false);
  assert.equal(isMobileVoiceAudioFrame(new Uint8Array(MOBILE_VOICE_MAX_AUDIO_FRAME_BYTES)), true);
  assert.equal(isMobileVoiceAudioFrame(new Uint8Array(MOBILE_VOICE_MAX_AUDIO_FRAME_BYTES + 2)), false);
});
