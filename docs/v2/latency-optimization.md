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
3. Reuse completed step state and evidence; avoid asking the model to decide what the controller already knows.
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
- context mode: bounded_history, step_context_full, step_context_delta, or full_accumulated

The telemetry callback is optional and appended to the existing runAgent arguments, preserving existing callers. Telemetry delivery errors are isolated and cannot fail the agent request. Raw model prompts and user evidence are not copied into telemetry records; only size/count metadata is recorded.

The benchmark runner stores detailed V2 records in model_calls and adds model-call count and median token metrics to its JSON output. V1 does not expose the new callback and is explicitly reported as not instrumented, not as zero model calls.

## Initial code-inspection finding

At this instrumentation baseline:
- Each planned step is invoked with a copy of the currently accumulated message list, then appends its own step instruction. Its telemetry mode is therefore step_context_full, not a delta.
- Final synthesis receives the accumulated messages plus a serialized summary of step outcomes. This is recorded as full_accumulated.
- The planner receives a bounded slice of recent user/assistant history and the current request, recorded as bounded_history.

These are observations about current context construction, not yet proof that context duplication is the dominant latency cause. Use measured token counts and per-call durations to establish that before changing the context strategy.

## Acceptance criteria

- End-to-end median runtime: target at or below 130 seconds, and faster than V1.
- Research/report quality: at least 32/35 on the same seven human-scored criteria.
- No factual-accuracy regression.
- Zero tool errors on the benchmark scenario where the underlying services are healthy.
- Preserve structured Orchestra events, recovery behavior, cancellation, and evidence provenance.
- Report model-call count and median input, output, and total tokens per call alongside wall time.

Do not trade away verification or silently truncate required evidence to meet a time target. If latency improves but quality drops below the threshold, reject the optimization.

## Current status

Phase 1.1 instrumentation is the first implementation slice. No planner, execution-state, synthesis, or verification behavior has been optimized yet. A new benchmark run is required to establish the instrumented baseline before those changes begin.
