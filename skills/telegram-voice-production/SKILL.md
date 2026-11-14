---
name: telegram-voice-production
description: Telegram voice notes, spoken replies, audio constraints, Deepgram transcription, ElevenLabs speech, and voice-channel response formatting.
---

# Telegram voice production

1. Keep spoken replies concise, natural, and easy to interrupt. Lead with the result.
2. Never read URLs, links, tables, hashes, IDs, or dense source lists aloud; put them in the text supplement.
3. Preserve the `===SPOKEN===` and `===TEXT===` response contract on spoken channels.
4. Enforce Telegram audio size and duration limits before provider calls and normalize through bounded FFmpeg.
5. Retry only transient Deepgram and ElevenLabs failures with bounded timeouts and backoff.
6. If speech generation fails, report it accurately and preserve the text answer.
7. Never accept provider keys, voice IDs, or runtime configuration from chat content.
