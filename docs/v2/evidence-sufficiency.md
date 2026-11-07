# Orchestra 2.0 — Evidence Sufficiency and Execution Control (Phase 1.2)

## Goals

Phase 1.2 reduces repeated research and makes execution outcomes measurable without trading away factual quality.

1. Give each planned step explicit, observable completion criteria.
2. Reuse successful read-only results within one request.
3. Stop a repeated duplicate-only tool loop instead of spending the remaining step budget on identical research.
4. Make recovery receive the failed step's actual evidence and prerequisite context.
5. Distinguish completed, partial, failed, and dependency-blocked steps.
6. Distinguish a run that returned a response from a task that actually completed.

## Evidence reuse

`ToolEvidenceCache` is request-scoped. It stores only successful read-only results:
- Web search: conservative token-containment matching, with the result-count setting held constant.
- Fetch: normalized exact URL matching.
- Memory recall: conservative query matching.
- File read/list/grep: exact operation, path, and search matching.

Mutations and failed reads are never cached. Cache reuse returns a tool result under the new tool-call ID and annotates its provenance. A duplicate-only model turn receives an instruction to use the existing result; two consecutive duplicate-only turns stop that step and preserve its evidence for synthesis.

This is a conservative duplicate guard, not a semantic proof that two different queries have identical intent. A later evaluation should inspect false-positive and false-negative examples.

## Completion criteria

The planner now requests 1–5 concrete completion criteria per step. The validated criteria are passed into the step context. If an older or nonconforming plan omits them, the step task is used as a compatibility fallback.

The model still decides whether evidence satisfies the criteria; no extra model-based critic call is added. Unresolved criteria should be stated as unresolved rather than silently treated as satisfied.

## Recovery context

A recovery step now depends on the original failed step when building its context. This ensures the prior answer, observations, and prerequisite results are actually supplied to recovery. Previously, recovery steps had no dependencies, so the instruction to reuse existing evidence was not backed by the context builder.

Recovery remains bounded and read-only. Mutations are not replayed.

## Outcome model

Step outcomes are:
- `completed`: the step returned a final result.
- `partial`: usable evidence exists, but the step did not return a final result.
- `failed`: the step ran but produced no usable result.
- `blocked`: the step did not run because a prerequisite failed.

The run status remains separate from task status. A benchmark process may finish normally while its task is partial or failed. The benchmark records both values and a structured task outcome event.

## Tests

Unit tests cover:
- near-duplicate search reuse;
- exact normalized URL reuse;
- same-batch duplicate calls;
- no caching of failed reads or mutations;
- distinct partial, blocked, and failed progress states.

## Acceptance gate

- No duplicate read-only operation should be re-executed when a successful equivalent result is already available.
- Recovery must receive the original failed step's evidence.
- Task outcome counts must reconcile with step outcomes.
- No mutation may be cached or automatically replayed.
- Quality must score at least 32/35 on the shared rubric.
- Compare runtime and tool/model-turn counts, but do not accept speed improvements that reduce report quality.
