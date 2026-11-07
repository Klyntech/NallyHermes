# V2 Orchestra reliability benchmark

This benchmark runs the current V2 source tree four times sequentially against the same research scenario. It is designed to show run-to-run variability and task reliability on one fixed commit; it no longer compares V1 against V2.

## Required repository secrets

Add these under **Settings → Secrets and variables → Actions → Repository secrets**:

| Secret | Value |
|---|---|
| `NVIDIA_NIM_API_KEY` | NVIDIA NIM API key |
| `TAVILY_API_KEY` | Tavily API key |
| `BENCHMARK_DATABASE_URL` | Connection string for a dedicated, isolated benchmark database |

Do not use the production database. Each of the four runs uses a distinct synthetic benchmark user ID. The workflow supplies inert Telegram placeholders because the shared application configuration requires those fields. LightRAG is disabled because this scenario is web research.

## Run

1. Open **Actions → V2 Orchestra Reliability Benchmark** on the default `main` branch.
2. Choose **Run workflow**.
3. Keep the model and repository secrets unchanged across repeated benchmark batches.
4. The workflow checks out the current `v2` branch once, records its exact commit, installs dependencies once, and runs four trials sequentially.

The prompt, model, provider endpoint, tool limits, database, and source commit are identical across all four trials. Sequential execution avoids intentionally increasing provider concurrency. Provider-side load, web-search variation, and network conditions can still differ.

## Outputs

On success, the workflow commits these files to `v2`:

- `benchmarks/results/benchmark.md` — four-run summary, latency distribution, and task outcomes.
- `benchmarks/results/benchmark.json` — machine-readable aggregate and all four run records.
- `benchmarks/results/v2-run-1.json` through `v2-run-4.json` — raw per-run traces and answers.

The raw traces are also uploaded as a GitHub Actions artifact retained for 90 days. Each trace includes the exact V2 SHA, model, duration, task outcome, progress events, Orchestra events, model-call telemetry, tool errors, retries, and answer.

## Interpretation

Four runs are a small diagnostic sample, not a statistically conclusive performance claim. The report includes minimum, median, maximum, mean, standard deviation, and range for duration. Interpret these alongside task outcomes, tool errors, and the raw traces. A successful GitHub Actions workflow means the runner completed; it does not mean the research task was complete or factually correct.

Use `benchmarks/quality-rubric.md` for the separate seven-dimension, 35-point human quality review. Do not infer quality from latency or execution counts alone.
