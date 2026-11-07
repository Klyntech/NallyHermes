# Orchestra benchmark

This benchmark compares the pinned V1 source revision with the V2 source revision by running the same LightRAG research task directly against each checked-out source tree in GitHub Actions.

## Required repository secrets

Add these under **Settings → Secrets and variables → Actions → Repository secrets**:

| Secret | Value |
|---|---|
| `NVIDIA_NIM_API_KEY` | NVIDIA NIM API key |
| `TAVILY_API_KEY` | Tavily API key |
| `BENCHMARK_DATABASE_URL` | Neon connection string for a dedicated, isolated benchmark database |

Do not use the production Neon database. The runner creates/updates the application schema and inserts two synthetic benchmark users. It does not need a Telegram bot token; the workflow supplies inert placeholder values because the application's shared configuration schema requires them.

LightRAG is disabled for this scenario. The task uses web search and fetch only. Both revisions use the same model, provider endpoint, API keys, database server, prompt, and execution limits. Each revision gets a separate synthetic user ID.

## Run

1. Open **Actions → V1 vs V2 Orchestra Benchmark**.
2. Choose **Run workflow** on the `v2` branch.
3. Keep the same model selection for repeated comparisons.
4. Start the run and inspect the individual V1 and V2 steps.

## Outputs

On success, the workflow commits these files to `v2`:

- `benchmarks/results/benchmark.md` — readable side-by-side report.
- `benchmarks/results/benchmark.json` — combined machine-readable report.
- `benchmarks/results/v1-run.json` — V1 raw progress trace and answer.
- `benchmarks/results/v2-run.json` — V2 raw progress and structured Orchestra trace.

The raw traces are also uploaded as a GitHub Actions artifact, retained for 90 days. The Markdown report leaves the seven 0–5 quality scores pending for human review; raw counts are not treated as quality scores.

## Interpretation

This is a controlled single-run comparison, not a statistically conclusive performance claim. Model/provider nondeterminism, web search variability, rate limits, and network latency can affect results. Compare answer correctness and source quality alongside execution metrics. V2's structured event count is not directly comparable to V1's legacy progress-event count.

The V1 baseline is pinned to `4ba2b87084a4b003331e0f9c687bbf0822558edd`. The workflow records the exact V2 checkout SHA for each run.
