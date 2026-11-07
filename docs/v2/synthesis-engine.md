# Orchestra 2.0 — Synthesis Engine (Phase 1.3)

## Scope

Phase 1.3.1–1.3.5 introduces a dedicated, channel-neutral synthesis boundary:

1. A bounded evidence package is built from the original request, plan outcomes, completion criteria, and step-local observations.
2. A claim ledger maps every planned completion criterion to its step and candidate evidence IDs. "Candidate" deliberately does not mean verified.
3. A dedicated synthesis module instructs the model to assess each claim against source excerpts, cite available URLs, distinguish facts from recommendations, and disclose gaps.
4. A deterministic completion disclosure prevents an incomplete execution from being presented as complete when the generated answer omits the status.
5. The package has a deterministic size budget; synthesis receives the evidence contract rather than the raw accumulated tool/model transcript.

## Evidence contract

The package includes a schema version, execution counts/status/stop reason, original user request, claim records, source records, and concise step outcomes. Source records preserve tool-call provenance and extracted URLs. Excerpts and the overall package are bounded.

A completed plan step marks its criteria as candidates for assessment, not automatically supported. The synthesis model must inspect the evidence itself. Partial, failed, and blocked steps create unresolved claim entries.

Direct-mode requests use bounded tool outputs when there is no plan. Planned execution uses structured step evidence only.

## Completion and quality guard

If execution is incomplete and the model omits any partial/incomplete disclosure, the runtime appends a deterministic status section with step counts, stop reason, and unresolved criteria. This is a safety net, not a substitute for claim-level synthesis.

## Performance

The synthesis input is now a compact JSON evidence contract, not the entire model conversation. The package is capped at 48,000 characters, with source excerpts reduced or lower-priority source records removed first. The original request, execution status, and claim ledger are retained.

## Explicit limitations

- The claim ledger is generated from planner completion criteria; it does not independently prove claims.
- Source URL extraction is conservative and does not infer canonical URLs or titles.
- Citation correctness remains a model-quality concern; the module preserves provenance and requires source-grounded citations but does not claim to semantically verify citations.
- This phase does not alter planning, recovery, or tool scheduling behavior. Blocked-step diagnosis remains a separate execution-control investigation.

## Validation

Unit tests cover claim mapping, provenance/URL retention, transcript exclusion, bounded package behavior, and deterministic partial disclosure. CI is the authoritative typecheck/test/build gate.
