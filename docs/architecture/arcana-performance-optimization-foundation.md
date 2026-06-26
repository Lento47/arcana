# Arcana Performance Optimization Foundation

This branch is intentionally non-breaking. It adds performance measurement and optimization contracts before touching live runtime behavior.

## Objective

Make Arcana faster and more efficient without reducing governance, traceability, security, or TUI correctness.

The performance direction follows the token-kernel research: tokens are a governed kernel resource, and optimization should happen through preflight accounting, admission decisions, actual-usage reconciliation, context discipline, cache-aware layout, and measurable runtime budgets.

## Non-breaking rule

No existing execution behavior changes in this foundation slice.

This branch only adds:

- performance budgets
- token efficiency scoring
- context strategy selection
- candidate search stopping policy
- tests for each optimization primitive

Runtime wiring comes later and must be behind rollout flags.

## Optimization layers

1. TUI render performance
   - stable projection inputs
   - deterministic summaries
   - bounded panel rendering
   - no expensive recomputation inside render helpers

2. Kernel projection performance
   - event replay budgets
   - projection freshness tracking
   - gap-aware but low-cost summaries

3. Token efficiency
   - estimate vs actual reconciliation
   - cache-read ratio
   - reasoning/output pressure
   - cost and latency efficiency

4. Context efficiency
   - prefer cache-friendly static prefixes
   - retrieve focused evidence before raw replay
   - compact long-running state before large-window replay
   - preserve provenance and security controls

5. Candidate search efficiency
   - adaptive stop decisions
   - budget-aware candidate count
   - confidence and quality margin gates
   - verifier-aware stopping

6. Security and governance preservation
   - performance cannot bypass permission, mutation, verifier, RunProof, or rollback authority
   - token reduction must not remove required evidence
   - context compaction must not preserve secrets

## Acceptance gates

A performance improvement is valid only if it satisfies all gates:

- typecheck passes
- tests pass
- no footer.command.tsx rewrite
- no existing behavior changed without a rollout flag
- no governance authority bypassed
- token/context optimization remains traceable
- performance budget functions are deterministic

## Next rollout path

1. Add pure contracts and tests.
2. Add runtime measurements in shadow mode.
3. Expose meters in cockpit projection.
4. Add rollout flags for enforcement.
5. Enforce only after stable telemetry proves safe thresholds.
