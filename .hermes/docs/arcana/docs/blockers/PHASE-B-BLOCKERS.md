# Phase B — Verification and Replay: Blocker Register

**Status: COMPLETE / FROZEN** (`arcana-epistemic-runtime-phase-b` tag).

## Open blockers

**None.**

## Gate audit (playbook §14)

| Gate | Required | Evidence | Verdict |
|---|---|---|---|
| Invalid event chains accepted | 0 | `event-hash.test.ts`, `run-proof.test.ts` | PASS |
| Historical proofs mutated by revalidation | 0 | `live-revalidation.test.ts` immutability cases | PASS |
| False FULL reproducibility classifications | 0 | `deterministic-replay.test.ts`, `replay-matrix.test.ts` | PASS |
| False COMPLETE trace profiles | 0 | trace-health semantics in `run-proof.ts` + suites | PASS |
| Audit/live reconstruction disagreements | 0 | `audit-replay.test.ts`, `live-revalidation.test.ts` | PASS |
| Phase A regressions | 0 | combined engine/core reruns (2026-08-02) | PASS |
| Proof export/verify fixtures | 100% | `run-proof-export.test.ts`, `run-proof-performance.test.ts` | PASS |
| Replay drift-detection fixtures | 100% | `replay-fixture.test.ts`, `replay-matrix.test.ts` | PASS |

## Task completion evidence (playbook §13)

| Task | Weight | Evidence |
|---|---:|---|
| B1 RunProof schema | 15% | `packages/arcana/src/proof/types.ts`, `run-proof.ts` |
| B2 Proof generation and verification | 15% | `proof-manager.ts`, `proof-runtime.ts` + tests |
| B3 Audit replay | 15% | `audit-replay.ts` + tests |
| B4 Deterministic replay | 20% | `deterministic-replay.ts` + fixture matrix |
| B5 Live revalidation | 10% | `live-revalidation.ts` + tests |
| B6 Trace health | 10% | RunProof trace axes + degraded-evidence tests |
| B7 Performance and scalability | 5% | `run-proof-performance.test.ts` (derive p50 2.89–5.40 ms) |
| B8 Documentation and freeze | 10% | `PHASE-B-MILESTONE.md`, protocol registry |

## Performance note

Measured at the 2026-08-01/02 checkpoint: RunProof derivation p50 2.89–5.40 ms
over the evaluated event volume; audit replay derivation < 500 ms. Re-measure
at the exact final commit for the full Phase B freeze claim.

## Nonclaims preserved

Proof verification is model-independent; it does not assert semantic truth of
external facts or environment reproducibility on other hosts.
