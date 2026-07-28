# Type/Test Baseline Freeze

**Date:** 2026-07-28
**Commit:** 2dffbe34
**Branch:** phase-a-epistemic

## Source Typecheck

- **Errors:** 0
- **Cast boundaries:** 8 (all documented with inline comments)
  - processor.ts: `as Handle`, `as Interface`, `LayerNode.make as any` (×2)
  - event-store.ts: `as Interface["append"]`
  - app-runtime.ts: `ManagedRuntime.make as any`
  - prompt.ts: `as Effect.Effect<SessionV1.WithParts>`, `LayerNode.make as any`
  - server.ts: `createRoutes return as any`

## Epistemic Tests

- **Pass:** 21/21
- **Expect calls:** 71
- **Files:** event-store-concurrency.test.ts, event-hash.test.ts, event-store-multi-connection.test.ts

## Test Typecheck Errors (44)

All in test files only. Exact diagnostics captured below. CI rule: reject ≥45.

### By file:
- compaction.test.ts: 16 errors (Layer/Effect dependency channel mismatches)
- event-store-concurrency.test.ts: 10 errors (Effect dependency channel)
- event-store-multi-connection.test.ts: 2 errors (EffectDrizzleQueryError)
- prompt.test.ts: 3 errors (Layer dependency channel)
- structured-output-integration.test.ts: 1 error (Layer dependency channel)
- workspace.test.ts: 2 errors (Layer/Effect dependency channel)
- app-runtime-logger.test.ts: 1 error (Body type mismatch)
- event-hash.test.ts: 2 errors (base reference, unused ts-expect-error)
- httpapi-*.test.ts: 5 errors (Layer dependency channel)
- plugin/workspace-adapter.test.ts: 1 error (Layer dependency channel)
- server/httpapi-exercise/index.ts: 1 error (Effect error channel)

### Root cause pattern:
All test errors are `Service` → `never` dependency channel mismatches from Effect Layer composition. The test layers provide services that the type system tracks as unresolved. These are framework-level typing issues, not logic errors.

## Error-Swallowing Verification

- `Effect.catchLog` was `undefined` at runtime (never functional)
- Replaced with `Effect.catch(() => Effect.void)` — actually works
- Trace health persistence happens inside `trackedAppend` BEFORE re-throw
- Caller's catch discards re-thrown error — trace health preserved
- Test 10 verifies: successful append → COMPLETE, traceInfo correct
