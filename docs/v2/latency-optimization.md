# Orchestra 2.0 — Latency Optimization (Phase 1.1)

## Objective

Reduce V2 end-to-end latency below the pinned V1 baseline without reducing report quality, source credibility, factual accuracy, recovery behavior, or observability.

Initial benchmark:
- V1: 137.6 seconds
- V2: 210.2 seconds
- V2 quality score: 32/35 versus V1: 29/35
- V2 tool wall time was lower (11.9s versus 24.8s) and had no tool errors.

The first optimization target is unnecessary model work, not the tool adapters.

## Implementation sequence

1. Instrument every model call before changing execution behavior.
2. Reduce planner-call overhead while preserving useful plan granularity.
3. Isolate each step context: retain the original request and agent instructions, then add only bounded results from that step's prerequisite chain. Do not replay unrelated step transcripts.
4. Synthesize from a bounded evidence package rather than replaying unnecessary conversation history.
5. Verify explicit unresolved claims; stop when each is supported or clearly labeled as inference/unknown.
6. Benchmark five alternating-order runs and compare medians.

## Instrumentation contract

Each V2 model call records:
- monotonic call number and phase (planning, step_execution, recovery, synthesis, direct_execution)
- reason for the call
- model and start timestamp
- elapsed milliseconds and success/error status
- provider input/output/total token counts when available
- serialized context characters and approximate input-token estimate
- context mode: bounded_history, step_context_delta, evidence_package, or full_accumulated

The telemetry callback is optional and appended to the existing runAgent arguments, preserving existing callers. Telemetry delivery errors are isolated and cannot fail the agent request. Raw model prompts and user evidence are not copied into telemetry records; only size/count metadata is recorded.

The benchmark runner stores detailed V2 records in model_calls and adds model-call count and median token metrics to its JSON output. V1 does not expose the new callback and is explicitly reported as not instrumented, not as zero model calls.

## Initial code-inspection finding (pre-optimization baseline)

Before context isolation, each planned step received a copy of the growing shared conversation. Every model turn within a step also replayed the full local tool-call transcript. Final synthesis received the accumulated conversation plus step outcomes. This produced the measured high-token pattern in the instrumented benchmark.

## Step context isolation

Each step starts from the immutable request context, not the transcript accumulated by earlier steps. It receives only bounded summaries and evidence from its transitive prerequisites. Independent steps do not see unrelated step results. The prerequisite package is capped at 24,000 characters.

Within a step, completed tool-call turns are compacted into a rolling evidence package before the next model call. The next turn retains at most four observations (1,800 characters each) and two assistant notes (1,000 characters each), while the structured outcome retains the broader bounded evidence set. Raw tool-call transcripts are not replayed.

Completed step transcripts are not appended to shared request context. Final synthesis receives the original request plus structured step outcomes, not the raw tool transcript; telemetry labels this as `evidence_package`.

## Acceptance criteria

- End-to-end median runtime: target at or below 130 seconds, and faster than V1.
- Research/report quality: at least 32/35 on the same seven human-scored criteria.
- No factual-accuracy regression.
- Zero tool errors on the benchmark scenario where the underlying services are healthy.
- Preserve structured Orchestra events, recovery behavior, cancellation, and evidence provenance.
- Report model-call count and median input, output, and total tokens per call alongside wall time.

Do not trade away verification or silently truncate required evidence to meet a time target. If latency improves but quality drops below the threshold, reject the optimization.

## Current status

Step context isolation is implemented as the first behavior optimization. The next benchmark must verify reduced step input tokens, preserved research quality, and no increase in unnecessary tool calls. Planning and claim-driven verification have not yet been optimized.
