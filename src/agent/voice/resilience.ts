export type VoiceProvider = "deepgram" | "elevenlabs";

export async function fetchVoiceProvider(
  provider: VoiceProvider,
  input: RequestInfo | URL,
  init: RequestInit,
  options: { retries: number; timeoutMs: number }
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.retries + 1; attempt++) {
    const startedAt = Date.now();
    try {
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(options.timeoutMs)
      });
      const retryable = isRetryableStatus(response.status);
      logVoiceProvider(provider, attempt, Date.now() - startedAt, response.status, retryable && attempt <= options.retries);
      if (!retryable || attempt > options.retries) return response;
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      await sleep(retryAfter ?? backoffMs(attempt));
    } catch (error) {
      lastError = error;
      logVoiceProvider(provider, attempt, Date.now() - startedAt, undefined, attempt <= options.retries);
      if (attempt > options.retries || !isRetryableError(error)) throw error;
      await sleep(backoffMs(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${provider} request failed.`);
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  return /timeout|timed out|fetch failed|network|socket|ECONNRESET|ECONNREFUSED|ENOTFOUND|UND_ERR/i.test(error.message);
}

function backoffMs(attempt: number): number {
  const base = Math.min(4_000, 250 * 2 ** (attempt - 1));
  return base + Math.floor(Math.random() * 150);
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(10_000, Math.max(0, seconds * 1_000));
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.min(10_000, Math.max(0, timestamp - Date.now())) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logVoiceProvider(
  provider: VoiceProvider,
  attempt: number,
  latencyMs: number,
  status: number | undefined,
  retrying: boolean
): void {
  console.info("voice.provider", JSON.stringify({ provider, attempt, latency_ms: latencyMs, status: status ?? "network_error", retrying }));
}
