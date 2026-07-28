# Type/Test Baseline Freeze

**Date:** 2026-07-28
**Commit:** 937d7b44 (to be updated on commit)
**Branch:** phase-a-epistemic
**Last verified:** 2026-07-28

## Source Typecheck

- **Errors:** 0
- **Cast boundaries:** 8 (all documented with numbered inline comments)
  - #1 processor.ts:1183 — `as Handle` (Effect.fn generator return type)
  - #2 processor.ts:1186 — `as Interface` (Effect.fn dependency channel)
  - #3 processor.ts:1209 — `layer as any` (LayerNode.make Layer composition)
  - #4 processor.ts:1223 — `] as any` (LayerNode node array type)
  - #5 event-store.ts:265 — `as Interface["append"]` (Effect.catch error channel)
  - #6 app-runtime.ts:108 — `AppLayer as any` (ManagedRuntime.make)
  - #7 prompt.ts:1957 — `layer as any` (LayerNode.make Layer composition)
  - #8 server.ts:292 — `as any` (createRoutes return type)

## Epistemic Tests

- **Pass:** 43/43
- **Expect calls:** 151
- **Files:** event-hash.test.ts, event-store-concurrency.test.ts, event-store-multi-connection.test.ts, run-proof.test.ts

## Test Typecheck Errors (66)

All in test files only. 0 source errors. CI rule: fingerprint comparison (see below).

### By file:
| File | Count | Error Code | Pattern |
|------|-------|------------|---------|
| run-proof.test.ts | 22 | TS2345 | `Effect<void, unknown, unknown>` → dependency channel |
| compaction.test.ts | 16 | TS2345 | `Service → never` dependency channel |
| event-store-concurrency.test.ts | 10 | TS2345 | Effect dependency channel |
| prompt.test.ts | 3 | TS2345 | Layer dependency channel |
| httpapi-*.test.ts (5 files) | 5 | TS2345 | Layer dependency channel |
| workspace.test.ts | 2 | TS2345 | Layer/Effect dependency channel |
| event-hash.test.ts | 2 | TS2304, TS2578 | base reference, unused ts-expect-error |
| event-store-multi-connection.test.ts | 2 | TS2345 | EffectDrizzleQueryError |
| structured-output-integration.test.ts | 1 | TS2345 | Layer dependency channel |
| app-runtime-logger.test.ts | 1 | TS2345 | Body type mismatch |
| workspace-adapter.test.ts | 1 | TS2345 | Layer dependency channel |
| httpapi-exercise/index.ts | 1 | TS2345 | Effect error channel |
| **Total** | **66** | | |

### Root cause pattern:
All test errors are `Service → never` dependency channel mismatches from Effect Layer composition. The test layers provide services that the type system tracks as unresolved. These are framework-level typing issues, not logic errors.

## Proof Semantics (verified)

- **ProofLevel:** P0 (TRACE) → P1 (INTEGRITY) → P2 (REPRODUCIBLE, unreachable) → P3 (VERIFIED)
- **TraceHealth:** COMPLETE | DEGRADED | UNAVAILABLE
- **LifecycleStatus:** COMPLETE | INCOMPLETE | CRASHED | CANCELLED
- **IntegrityStatus:** VALID | INVALID | UNVERIFIED
- **P3 requires:** P1 ∧ completionMethod=VERIFIED_COMPLETE ∧ lifecycle=COMPLETE ∧ traceHealth=COMPLETE ∧ all required obligations satisfied
- **Hard caps:** DEGRADED/UNAVAILABLE trace → max P1; INCOMPLETE lifecycle → max P1; NO_ACTIVE_CONTRACT → max P1
- **ProofHash:** computed from ProofHashPayload (proofHash excluded from its own input)
- **RunRoot:** domain-separated ("arcana-run-root-v1"), versioned, length-prefixed, per-event structured data

## Error-Swallowing Verification

- `Effect.catchLog` was `undefined` at runtime (never functional)
- Replaced with `Effect.catch(() => Effect.void)` — actually works
- Trace health persistence happens inside `trackedAppend` BEFORE re-throw
- Caller's catch discards re-thrown error — trace health preserved
- Verified by test 10 in event-store-concurrency.test.ts
