import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { eq } from "drizzle-orm";

const { runAgent } = await import("../src/agent/controller.ts");
const { ensureDatabase, db } = await import("../src/db/client.ts");
const { users } = await import("../src/db/schema.ts");

const prompt = `Find the official LightRAG documentation and investigate its storage options.

I need a technical report covering:

1. Identify the official documentation and repository.
2. Find the supported storage backends for key-value storage, vector storage, graph storage and document status.
3. Explain the differences between the available storage options.
4. Investigate whether PostgreSQL/Neon is a suitable storage setup.
5. Identify any compatibility limitations or important configuration considerations.
6. Recommend a practical storage architecture for a production AI agent.

Use official sources wherever possible. Cross-check important claims.

If one research step fails, do not abandon the entire task. Recover where possible, use the evidence already collected, continue independent steps, and clearly disclose anything you could not verify.

Do not invent facts or claim that research was completed when it wasn't.

Produce a structured technical report with source links and a final recommendation.`;

const userId = process.env.BENCHMARK_USER_ID;
if (!userId) throw new Error("BENCHMARK_USER_ID is required.");

await ensureDatabase();
const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, userId)).limit(1);
if (!existing) {
  await db.insert(users).values({
    telegramId: userId,
    username: "github-benchmark",
    firstName: "Benchmark",
    timezone: "Africa/Lagos"
  });
}

const progress = [];
const structured = [];
const modelCalls = [];
const startedAt = new Date().toISOString();
const start = performance.now();
let answer = "";
let runError = null;

try {
  // V1 accepts four arguments; V2 additionally accepts the structured-event
  // callback as argument five. JavaScript safely ignores it on V1.
  answer = await runAgent([], prompt, userId, async (event) => {
    progress.push({ at: new Date().toISOString(), ...event });
  }, async (event) => {
    structured.push(event);
  }, undefined, async (trace) => {
    modelCalls.push(trace);
  });
} catch (error) {
  runError = error instanceof Error ? error.message : String(error);
}

const durationMs = Math.round(performance.now() - start);
const toolStarts = progress.filter((event) => event.type === "tool_start");
const toolErrors = progress.filter((event) => event.type === "tool_error");
const retries = progress.filter((event) => event.type === "recovery_retry");
const stepStarts = progress.filter((event) => event.type === "plan_step_start");
const stepCompletes = progress.filter((event) => event.type === "plan_step_complete");
const stepFailures = progress.filter((event) => event.type === "plan_step_failed");
const sortedInputTokens = modelCalls.map((call) => call.input_tokens ?? call.estimated_input_tokens).sort((a, b) => a - b);
const medianInputTokens = sortedInputTokens.length
  ? sortedInputTokens[Math.floor((sortedInputTokens.length - 1) / 2)]
  : null;

const result = {
  schema_version: 1,
  version: process.env.BENCHMARK_VERSION ?? "unknown",
  git_sha: process.env.BENCHMARK_SHA ?? "unknown",
  model: process.env.NVIDIA_NIM_MODEL ?? "repository-default",
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  duration_ms: durationMs,
  status: runError ? "runtime_error" : "completed",
  error: runError,
  prompt,
  metrics: {
    progress_event_count: progress.length,
    structured_event_count: structured.length,
    model_call_count: modelCalls.length,
    median_input_tokens_per_call: medianInputTokens,
    model_call_errors: modelCalls.filter((call) => call.status === "error").length,
    tool_call_starts: toolStarts.length,
    tool_errors: toolErrors.length,
    retry_events: retries.length,
    planned_step_starts: stepStarts.length,
    completed_step_events: stepCompletes.length,
    failed_step_events: stepFailures.length
  },
  progress_events: progress,
  orchestra_events: structured,
  model_calls: modelCalls,
  answer
};

await mkdir("benchmarks/results", { recursive: true });
await writeFile("benchmarks/results/run.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({
  version: result.version,
  sha: result.git_sha,
  status: result.status,
  duration_ms: result.duration_ms,
  metrics: result.metrics,
  error: result.error
}, null, 2));

