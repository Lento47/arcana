# @arcana/engine Typecheck Error Investigation

**Date:** 2026-07-30
**Status:** Pre-existing errors (not caused by crypto typecheck fixes)

## Executive Summary

After the `@arcana/core` typecheck fixes were applied, turbo cache busting caused `@arcana/engine` to re-typecheck for the first time. This surfaced **~100+ pre-existing typecheck errors** across source and test files. These errors existed before our changes and are unrelated to the crypto fixes.

## Error Categories

### Category A: CLI Command Shape Mismatch (1 error)

**File:** `src/cli/cmd/epistemic.ts:397`
```
Type 'typeof ReplayCommand' is missing the following properties from type 'CommandModule<{}, any>[]': pop, push, concat, join, and 34 more.
```

**Root Cause:** `ReplayCommand` is exported as a **class** (`export class ReplayCommand`) while `ProofCommand` is exported as a **const object literal** (`export const ProofCommand: CommandModule = {...}`). The `.command()` method on yargs expects `CommandModule` instances, not class constructors.

**Fix:** Either:
- Instantiate `new ReplayCommand()` at the call site (like `RevalidationCommand`), or
- Change `ReplayCommand` to export a `CommandModule` const instead of a class

**Files involved:**
- `src/cli/cmd/replay.ts:208` — `export class ReplayCommand`
- `src/cli/cmd/epistemic.ts:397` — `.command(ReplayCommand)` (should be `.command(new ReplayCommand())`)

---

### Category B: Missing Property in ProofHashPayload (2 errors)

**Files:** `src/cli/cmd/proof.ts:261, 779`
```
Property 'assuranceProfile' is missing in type '...' but required in type 'ProofHashPayload'.
```

**Root Cause:** The `ProofHashPayload` interface (in `src/session/epistemic/run-proof.ts:78`) requires an `assuranceProfile: AssuranceProfile` field. The construction at `proof.ts:261` doesn't include this field.

**Fix:** Add the `assuranceProfile` field to the payload construction, or derive it from existing data.

**Files involved:**
- `src/session/epistemic/run-proof.ts:87` — `readonly assuranceProfile: AssuranceProfile`
- `src/cli/cmd/proof.ts:261` — Missing field in payload construction

---

### Category C: Missing Module Declaration (1 error)

**File:** `src/cli/tui/ensure-solid-preload.ts:17`
```
Could not find a declaration file for module '@opentui/solid/preload'.
```

**Root Cause:** The `@opentui/solid` package doesn't expose TypeScript declarations for its `preload` subpath.

**Fix:** Add a `.d.ts` declaration file: `declare module '@opentui/solid/preload';`

---

### Category D: Effect Error Channel Mismatches (~80 errors)

**Files:** `src/session/prompt.ts`, `test/capability/*.test.ts`, `test/epistemic/*.test.ts`, `test/session/*.test.ts`

Common patterns:
```
Type 'Effect<void, NotFoundError, never>' is not assignable to type 'Effect<void, never, never>'
Type 'Effect<void, unknown, unknown>' is not assignable to type 'Effect<void, unknown, never>'
Type 'CapabilityGrantStoreError' is not assignable to type 'never'
```

**Root Cause:** These are Effect.ts "defect" channel mismatches. The test functions expect `Effect<void, never, R>` (no errors in error channel) but the implementations produce effects with errors in the error channel. This is a common pattern when Effect services evolved their error types but test signatures weren't updated.

**Files affected:**
- `test/capability/authorization-events.test.ts` (5 errors)
- `test/capability/grant-store-sqlite.test.ts` (18 errors)
- `test/capability/information-flow.test.ts` (14 errors)
- `test/capability/runtime-enforcement.test.ts` (4 errors)
- `test/epistemic/event-store-concurrency.test.ts` (11 errors)
- `test/epistemic/failure-injection.test.ts` (10 errors)
- `test/epistemic/run-proof.test.ts` (20 errors)
- `test/session/compaction.test.ts` (16 errors)
- `test/session/prompt.test.ts` (3 errors)

---

### Category E: Missing/Changed Exports (6 errors)

**Files:** `test/capability/delegation.test.ts`, `test/epistemic/event-hash.test.ts`

```
Module '"@arcana/core/capability/types"' has no exported member 'CapabilityGrantDraft'
Module '"@arcana/core/capability/types"' has no exported member 'DelegationRequest'
Module '"@arcana/core/capability/types"' has no exported member 'DelegatedContext'
Cannot find name 'base'
```

**Root Cause:** These types exist in `@arcana/core/capability/delegation.ts` and are re-exported from `@arcana/core/capability/index.ts`, but the test imports from a `types.ts` barrel file that doesn't include them.

**Fix:** Update import paths in test files to use the correct module.

---

### Category F: Type Literal Mismatches (8 errors)

**Files:** `test/capability/atomic-use-replay.test.ts`, `test/capability/labels.test.ts`, `test/capability/runtime-delegation.test.ts`, `test/capability/information-flow.test.ts`

```
Type '"system"' is not assignable to type '"approval" | "parent_capability" | "policy" | "user"'
Type '"SECRET"' is not assignable to type '"INTERNAL" | "PRIVATE" | "PUBLIC"'
Type '"security"' is not assignable to type '"model" | "policy" | "tool" | "user"'
```

**Root Cause:** Test fixtures use string literals that don't match the current type definitions. The types have evolved but test data hasn't been updated.

---

### Category G: Miscellaneous (3 errors)

- `src/tool/task.ts:21` — Import `ContractEngine` but file exports `Service`
- `test/capability/pep.test.ts:162,354,355` — Property `requestHash` doesn't exist on `AuthorizationRequest`
- `test/capability/intent-binding.test.ts:67` — `readonly string[]` not assignable to mutable `string[]`

---

## Priority Assessment

| Category | Count | Severity | Fix Effort |
|----------|-------|----------|------------|
| A: CLI command shape | 1 | High | Low |
| B: ProofHashPayload | 2 | High | Low |
| C: Module declaration | 1 | Low | Trivial |
| D: Effect error channels | ~80 | Medium | Medium |
| E: Missing exports | 6 | Medium | Low |
| F: Type literals | 8 | Low | Low |
| G: Miscellaneous | 3 | Medium | Low |

## Recommendation

These errors are **pre-existing** and not caused by the crypto typecheck fixes. They represent technical debt that accumulated while turbo cache was hiding the engine typecheck results.

**Immediate action:** None required for the crypto fix PR. The engine errors should be addressed in a separate PR focused on engine typecheck cleanup.

**Suggested approach:**
1. Fix Categories A, B, C first (quick wins, ~4 errors)
2. Fix Category E imports (~6 errors)
3. Fix Category F type literals (~8 errors)
4. Address Category D Effect errors in a dedicated sprint (~80 errors)
