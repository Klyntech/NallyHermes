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
    signal: AbortSignal.timeout(30_000)
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
): Promise<void> {
  if (!config.LIGHTRAG_ENABLED) return;
  await request<{ success: boolean }>("/v1/memory/insert", {
    user_id: telegramId,
    memory_id: memoryId,
    content
  });
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
