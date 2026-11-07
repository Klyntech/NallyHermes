# V2 Orchestra — Four-Run Reliability Benchmark

## Benchmark controls

- V2 commit: eda01a45ddbf8214c3757ca73afac31df633adec
- Model: nvidia/nemotron-3.5-super-vl-120b-a12b
- Scenario, prompt, tool limits, provider endpoint, and benchmark database configuration are held constant.
- Four runs execute sequentially to avoid deliberately adding concurrency pressure to the model provider.
- Each run uses a distinct synthetic user ID. LightRAG is disabled for this web-research scenario.

## Results

| Run | Duration (s) | Model time (s) | Synthesis (s) | Model calls | Tool calls | Tool errors | Hard deps | Context deps | Task outcome |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 235.27 | 256.06 | 61.53 | 40 | 54 | 3 | 2 | 0 | partial |
| 2 | 308.11 | 423.21 | 132.79 | 63 | 97 | 12 | 0 | 1 | partial |
| 3 | 372.13 | 506.00 | 162.19 | 64 | 101 | 12 | 4 | 0 | partial |
| 4 | 304.10 | 445.91 | 173.24 | 66 | 93 | 9 | 5 | 0 | partial |

## Latency distribution

| Statistic | Duration (seconds) |
|---|---:|
| Total duration — min | 235.27 |
| Total duration — median | 306.11 |
| Total duration — max | 372.13 |
| Total duration — mean | 304.90 |
| Total duration — standard deviation | 48.42 |
| Total duration — range | 136.86 |
| Model-call time — min | 256.06 |
| Model-call time — median | 434.56 |
| Model-call time — max | 506.00 |
| Model-call time — range | 249.94 |
| Synthesis time — min | 61.53 |
| Synthesis time — median | 147.49 |
| Synthesis time — max | 173.24 |
| Synthesis time — range | 111.71 |

## Reliability

- Complete runs: 0/4
- Partial runs: 4/4
- Failed runs: 0/4
- Total tool errors: 36

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
