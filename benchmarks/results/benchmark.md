# V2 Orchestra — Four-Run Reliability Benchmark

## Benchmark controls

- V2 commit: afbb93f83c7b41a4c0f5000d3e50de6819a22f21
- Model: nvidia/nemotron-3.5-super-vl-120b-a12b
- Scenario, prompt, tool limits, provider endpoint, and benchmark database configuration are held constant.
- Four runs execute sequentially to avoid deliberately adding concurrency pressure to the model provider.
- Each run uses a distinct synthetic user ID. LightRAG is disabled for this web-research scenario.

## Results

| Run | Duration (s) | Model time (s) | Synthesis (s) | Model calls | Tool calls | Tool errors | Task outcome |
|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 160.00 | 146.24 | 66.14 | 13 | 10 | 0 | partial |
| 2 | 208.26 | 194.47 | 71.66 | 20 | 16 | 3 | partial |
| 3 | 297.97 | 271.44 | 167.61 | 19 | 19 | 0 | partial |
| 4 | 253.47 | 248.09 | 86.05 | 11 | 8 | 0 | partial |

## Latency distribution

| Statistic | Duration (seconds) |
|---|---:|
| Total duration — min | 160.00 |
| Total duration — median | 230.86 |
| Total duration — max | 297.97 |
| Total duration — mean | 229.93 |
| Total duration — standard deviation | 51.34 |
| Total duration — range | 137.97 |
| Model-call time — min | 146.24 |
| Model-call time — median | 221.28 |
| Model-call time — max | 271.44 |
| Model-call time — range | 125.20 |
| Synthesis time — min | 66.14 |
| Synthesis time — median | 78.85 |
| Synthesis time — max | 167.61 |
| Synthesis time — range | 101.47 |

## Reliability

- Complete runs: 0/4
- Partial runs: 4/4
- Failed runs: 0/4
- Total tool errors: 3

## Interpretation

- Four observations are a small diagnostic sample, not a statistically conclusive performance claim.
- Compare task outcomes, error counts, and per-run traces before interpreting latency differences.
- A workflow success means the runner completed; it does not mean the research task was complete or factually correct.
- Quality scores remain a separate human review using `benchmarks/quality-rubric.md`.

## Raw traces

- Run 1: `v2-run-1.json`
- Run 2: `v2-run-2.json`
- Run 3: `v2-run-3.json`
- Run 4: `v2-run-4.json`
