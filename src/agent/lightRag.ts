import { config } from "../config.js";

type LightRAGQueryResult = {
  answer?: string;
  response?: string;
  data?: unknown;
};

function serviceHeaders(): Record<string, string> {
  if (!config.LIGHTRAG_API_TOKEN) throw new Error("LIGHTRAG_API_TOKEN is required when LightRAG is enabled.");
  return {
    "content-type": "application/json",
    authorization: `Bearer ${config.LIGHTRAG_API_TOKEN}`
  };
}

function describeFetchFailure(cause: unknown, path: string): string {
  if (cause instanceof Error) {
    const name = cause.name;
    const message = cause.message || "unknown error";
    if (name === "TimeoutError" || /aborted|timeout/i.test(message)) {
      return `LightRAG timed out calling ${path} (limit ${Math.round(config.LIGHTRAG_REQUEST_TIMEOUT_MS / 1000)}s). The memory service may be overloaded or unreachable.`;
    }
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|network/i.test(message) || name === "TypeError") {
      return `LightRAG is unreachable at ${config.LIGHTRAG_URL}${path}: ${message}. Check that the memory service is running and LIGHTRAG_URL is correct.`;
    }
    return `LightRAG request to ${path} failed: ${message}`;
  }
  return `LightRAG request to ${path} failed for an unknown reason.`;
}

async function request<T>(path: string, body: Record<string, unknown>, attempt = 1): Promise<T> {
  if (!config.LIGHTRAG_ENABLED) throw new Error("LightRAG is disabled.");
  try {
    const response = await fetch(new URL(path, config.LIGHTRAG_URL), {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.LIGHTRAG_REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`LightRAG request failed (${response.status}): ${detail}`);
    }
    return response.json() as Promise<T>;
  } catch (cause) {
    // One retry for transient network failures only (not HTTP 4xx/5xx from a completed response).
    const isHttpError = cause instanceof Error && /LightRAG request failed \(\d+\)/.test(cause.message);
    if (!isHttpError && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      return request<T>(path, body, attempt + 1);
    }
    if (cause instanceof Error && cause.message.startsWith("LightRAG")) throw cause;
    throw new Error(describeFetchFailure(cause, path));
  }
}

export async function indexMemory(
  telegramId: string,
  memoryId: string,
  content: string
): Promise<boolean> {
  if (!config.LIGHTRAG_ENABLED) return false;
  const result = await request<{ success: boolean }>("/v1/memory/insert", {
    user_id: telegramId,
    memory_id: memoryId,
    content
  });
  return result.success;
}

export async function retrieveMemory(
  telegramId: string,
  query: string
): Promise<string> {
  if (!config.LIGHTRAG_ENABLED || !query.trim()) return "";
  const result = await request<LightRAGQueryResult>("/v1/memory/query", {
    user_id: telegramId,
    query: query.trim().slice(0, 2000)
  });
  return result.answer ?? result.response ?? "";
}

export async function indexAcademicDocument(
  telegramId: string,
  documentId: string,
  title: string,
  course: string | undefined,
  content: string,
  filePath: string
): Promise<boolean> {
  if (!config.LIGHTRAG_ENABLED) return false;
  const result = await request<{ success: boolean }>("/v1/academic/insert", {
    user_id: telegramId,
    document_id: documentId,
    title: title.slice(0, 240),
    course: course?.slice(0, 160),
    source_type: "telegram_pdf",
    content: content.slice(0, 2_000_000),
    file_path: filePath.slice(0, 500)
  });
  return result.success;
}

export async function deleteMemory(telegramId: string, memoryId: string): Promise<void> {
  if (!config.LIGHTRAG_ENABLED) return;
  await request<{ success: boolean }>("/v1/memory/delete", {
    user_id: telegramId,
    memory_id: memoryId
  });
}

export async function diagnoseMemoryPipeline(telegramId: string): Promise<{
  initialized: boolean;
  written: boolean;
  read: boolean;
  deleted: boolean;
  absent_after_delete: boolean;
  success: boolean;
}> {
  return request("/v1/diagnostics/pipeline", {
    user_id: telegramId,
    query: "pipeline diagnostic"
  });
}


export async function benchmarkRerankers(): Promise<{
  query_passages: number;
  warmup_runs: number;
  measured_runs: number;
  endpoints: Record<string, string>;
  results: Record<string, {
    ok: boolean;
    samples_ms?: number[];
    median_ms?: number | null;
    p95_ms?: number | null;
    returned?: number | null;
    response_keys?: string[];
    ranking_preview?: Array<{ index?: number; score?: number; passage?: string }>;
    error?: string;
  }>;
}> {
  return request("/v1/diagnostics/rerank", {});
}
