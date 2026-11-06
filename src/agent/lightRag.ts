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

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!config.LIGHTRAG_ENABLED) throw new Error("LightRAG is disabled.");
  const response = await fetch(new URL(path, config.LIGHTRAG_URL), {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`LightRAG request failed (${response.status}): ${detail}`);
  }
  return response.json() as Promise<T>;
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
