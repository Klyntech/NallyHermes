import { spawn } from "node:child_process";

export type PreparedVoiceAudio = {
  audio: Buffer;
  mimeType: "audio/wav";
  durationSec: number | null;
  inputBytes: number;
  outputBytes: number;
};

export async function readResponseWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("That voice note is too large to download.");
  }
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error("That voice note is too large to download.");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("That voice note is too large to download.");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

type CommandResult = { stdout: Buffer; stderr: string };

/**
 * Normalize Telegram voice/audio into mono 16 kHz PCM WAV.
 *
 * Telegram voice notes are normally OGG/Opus, but Telegram audio messages may
 * use many codecs. FFmpeg gives the STT provider one predictable input while
 * keeping the Telegram-facing contract unchanged.
 */
export async function normalizeTelegramAudio(
  input: Buffer,
  options: { maxInputBytes: number; maxOutputBytes: number; timeoutMs: number }
): Promise<PreparedVoiceAudio> {
  if (input.length === 0) throw new Error("The downloaded voice note was empty.");
  if (input.length > options.maxInputBytes) {
    throw new Error("That voice note is too large to process.");
  }

  const converted = await runCommand(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error",
      "-i", "pipe:0",
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "pcm_s16le",
      "-f", "wav",
      "pipe:1"
    ],
    input,
    options.timeoutMs,
    options.maxOutputBytes
  );
  if (converted.stdout.length < 44) {
    throw new Error("The voice note did not contain a usable audio stream.");
  }
  return {
    audio: converted.stdout,
    mimeType: "audio/wav",
    durationSec: null,
    inputBytes: input.length,
    outputBytes: converted.stdout.length
  };
}

async function runCommand(
  command: string,
  args: string[],
  input: Buffer,
  timeoutMs: number,
  maxStdoutBytes: number
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;
    const finish = (error?: Error, result?: CommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`${command} timed out while processing the voice note.`));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxStdoutBytes) {
        child.kill("SIGKILL");
        finish(new Error("The normalized voice note exceeded the processing limit."));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error: NodeJS.ErrnoException) => {
      const detail = error.code === "ENOENT" ? `${command} is not installed.` : error.message;
      finish(new Error(`Voice audio processing failed: ${detail}`));
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim().slice(0, 300);
        finish(new Error(`${command} failed${signal ? ` (${signal})` : ` (${code ?? "unknown"})`}${detail ? `: ${detail}` : "."}`));
        return;
      }
      finish(undefined, { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString("utf8") });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}
