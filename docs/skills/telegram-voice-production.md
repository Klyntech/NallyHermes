# Telegram Voice Production Skill

This skill defines Nally’s production voice-note contract. It is intentionally Telegram-first: voice notes are accepted as bounded Telegram audio, normalized before transcription, answered through the existing orchestration layer, and returned as a short spoken reply plus an optional text supplement.

## Runtime contract

- Accept Telegram `message:voice` and `message:audio` updates.
- Reject oversized downloads before buffering them fully.
- Normalize supported Telegram codecs to mono, 16 kHz PCM WAV with FFmpeg.
- Reject notes longer than `VOICE_MAX_DURATION_SEC`.
- Retry only transient Deepgram and ElevenLabs failures with bounded exponential backoff and `Retry-After` support.
- Deduplicate Telegram message IDs so webhook redelivery cannot create duplicate replies.
- Keep spoken output bounded by `VOICE_TTS_MAX_CHARS`; links, tables, hashes, and source metadata stay in the text supplement.
- Never replay a provider mutation or claim success when speech generation failed.

## Production configuration

The defaults are conservative for Telegram voice notes:

```dotenv
VOICE_ENABLED=false
VOICE_PROVIDER_RETRIES=2
VOICE_MAX_AUDIO_BYTES=4000000
VOICE_MAX_DURATION_SEC=180
VOICE_AUDIO_PROCESS_TIMEOUT_MS=30000
VOICE_STT_TIMEOUT_MS=45000
VOICE_TTS_TIMEOUT_MS=60000
VOICE_TTS_MAX_CHARS=900
```

The deployment image must include `ffmpeg`. Telegram’s declared duration is enforced before processing, and FFmpeg validates and normalizes the actual stream. Provider keys and `ELEVENLABS_VOICE_ID` remain deployment secrets and are never accepted from chat input.

## Proven open-source foundations

Nally keeps grammY for Telegram transport and file APIs: <https://github.com/grammyjs/grammY>.

Audio probing, decoding, resampling, and PCM conversion use FFmpeg: <https://github.com/FFmpeg/FFmpeg>.

OpenAI Whisper is recorded as the optional local STT fallback path for a future deployment that needs to remove the Deepgram dependency. It is not bundled into the default Telegram process because its model/runtime footprint is materially heavier: <https://github.com/openai/whisper>.

The skill uses provider-neutral boundaries so a local Whisper worker can be added without changing Telegram handlers, conversation persistence, or the spoken/text response contract.
