# Phase A — Epistemic Foundation: Blocker Register

**Status: COMPLETE / FROZEN** (declared complete in the master spec and
`docs/STATUS.md`; tag lineage contained in `phase-d-implementation`).

## Open blockers

**None.**

## Gate audit (playbook §8)

| Gate | Required | Evidence | Verdict |
|---|---|---|---|
| Event-chain integrity violations undetected | 0 | `event-hash.test.ts`, `event-store-concurrency.test.ts`, `event-store-multi-connection.test.ts`, `failure-injection.test.ts` (engine suite) | PASS |
| Verified completions with unmet obligations | 0 | `completion-verifier.test.ts`, `obligation-engine.ts`, `completion-gate-idempotency.test.ts` | PASS |
| Evidence references to missing artifacts | 0 | claim/evidence store tests; receipt-kind tests (`packages/core/test/capability/receipt-kind.test.ts`) | PASS |
| Duplicate event sequences | 0 | transactional sequence tests in event-store suites | PASS |
| Phase A production-source type errors | 0 | repo-wide typecheck 16/16 (2026-08-02) | PASS |
| Deterministic completion disagreements | 0 | deterministic-replay + completion determinism tests | PASS |
| Schema migration tests | 100% | SQLite migration suite (`packages/core/src/database/migration*`) | PASS |
| Restart reconstruction tests | 100% | `run-proof-restart.test.ts`, `intent-binding-store-persistence.test.ts`, `capability-revocation-sqlite.test.ts` | PASS |

## Task completion evidence (playbook §7)

| Task | Weight | Evidence |
|---|---:|---|
| A1 Typed claim/evidence schemas | 10% | claim/evidence stores in `packages/engine/src/session/epistemic/claim-store.ts`; schema tests | 
| A2 Contracts, criteria, obligations, revisions | 15% | `contract-engine.ts`, `obligation-engine.ts`, `contract-admission.ts`, `contract-admission.test.ts` |
| A3 Append-only hash-linked event store | 20% | `event-store.ts` + concurrency/mutation/failure suites |
| A4 Execution receipts and artifacts | 15% | PEP receipts (`test_receipt`/`build_receipt`, F-19), receipt-kind tests |
| A5 Hard completion gate | 20% | `completion-verifier.ts` + idempotency tests |
| A6 Inspection commands | 10% | `arcana epistemic proof inspect/verify/export`, `replay audit/deterministic` |
| A7 Test/benchmark/document/freeze | 10% | `PHASE-B-MILESTONE.md`, phase baselines, this register |

## Historical blockers (closed)

| Blocker | Closure evidence |
|---|---|
| Completion gate idempotency was per-session, not per-contract | F-18 fix + `completion-gate-idempotency.test.ts` |
| Criteria receipts never emitted in production | F-19 fix + production receipt tests |

## Nonclaims preserved

Phase A does not prove authorization, host integrity, external truth, model
honesty, or cross-machine reproducibility of the environment.
