# Refactor Plan: Permission Merge, Self-Awareness Tools, and Path Classification

## Goal
Clean up the permission/self-awareness code added recently, remove duplication, and make future permission changes safer and more consistent.

## Scope
Touched files:
- `packages/core/src/v1/config/permission.ts`
- `packages/engine/src/agent/agent.ts`
- `packages/engine/src/tool/edit.ts`
- `packages/engine/src/tool/write.ts`
- `packages/engine/src/tool/apply_patch.ts`
- `packages/engine/src/tool/file-edit-guard.ts`
- `packages/ml/src/classifier.ts`
- Tests for all of the above

## Changes (implemented)

### 1. Extract an agent permission builder (agent.ts)
**Done.** Added a helper inside the `state` builder:
  ```ts
  function agentPermission(overrides: Parameters<typeof Permission.fromConfig>[0]) {
    return Permission.merge(defaults, Permission.fromConfig(overrides), homeProtection, user)
  }
  ```
- Replaced every native agent's `Permission.merge(defaults, Permission.fromConfig({...}), homeProtection, user)` with `agentPermission({...})`.
- Simplified the Truncate.GLOB loop to use an `explicitlyDenied` boolean and a flat arrow.

### 2. Centralise mutation permission classification
**Done.** Created `packages/engine/src/tool/mutation-permission.ts` with:
- `classifyMutation(filePath, guard)` → `{ selfAware, destructive }`
- `singleMutationPermission(filePath, relativePath, guard)` → `{ permission, always, metadata }`
- `classifyPatch(changes)` → aggregate self-awareness/destructive/permission-policy for multi-file patches.

Used it in:
- `edit.ts` (create and update branches)
- `write.ts`
- `apply_patch.ts` (now routes safe self-awareness patches to the `self_awareness` permission class, and treats delete/move under self-awareness as destructive)

### 3. Share self-awareness path constants between engine and ML
**Done.** Created `packages/core/src/util/self-awareness.ts` with `SELF_AWARENESS_PATH`, `PERMISSION_POLICY_PATH`, `isSelfAwarenessPath()`, and `isPermissionPolicyPath()`.
- `packages/engine/src/tool/file-edit-guard.ts` now imports and re-exports the helpers.
- `packages/ml/src/classifier.ts` imports from `@arcana/core/util/self-awareness` and no longer duplicates the regexes.
- Added `@arcana/core` as a dependency of `@arcana/ml`.

### 4. Refactor `edit.ts` create vs update branches
**Deferred.** The create and update branches still have meaningful differences (BOM handling, backup logic, file-system event type). After centralising the ask payload via `singleMutationPermission`, the remaining duplication is small and unifying it would add conditionals without improving readability.

### 5. Clean up Truncate.GLOB loop
**Done.** Rewrote the loop with a clearly named `explicitlyDenied` check and flat arrow predicates.

### 6. Add classifier-driven self-awareness tests
**Done.** Added unit tests in `packages/ml/src/classifier.test.ts` for:
- `.opencode/plans/roadmap.md` → benign self-awareness
- `.opencode/permissions.yaml` → review (permission-policy)
- `src/index.ts` → ordinary file, not self-awareness

Also added `packages/engine/test/tool/mutation-permission.test.ts` covering:
- self-awareness path recognition
- permission-policy exclusion
- destructive large edits
- single-file permission routing
- multi-file patch classification (including delete/move)

### 7. (Deferred) Rename `edit` permission ask for `apply_patch`
**Deferred.** `apply_patch` still asks with the `edit` permission class because the permission surface maps all write-capable tools to that class. A separate `apply_patch` permission kind would be a user-facing config change; left for future discussion.

## Additional fixes discovered during refactor
- `packages/engine/src/session/tools.ts:928-938` had a malformed `DENIED` branch (unclosed object literal) that broke parsing. Fixed it to return `mcpToolResult(...)` directly, matching the other branches.

## Verification
- `bun run typecheck` in `packages/core`, `packages/engine`, `packages/ml` — passed
- `bun test test/tool test/agent test/permission test/control-plane` in `packages/engine` — 602 pass / 0 fail
- `bun test src` in `packages/ml` — 52 pass / 0 fail
- `bun turbo build` — 8 successful tasks
- Full `bun run test` in `packages/engine` — running in background (was failing on apply_patch before the TDZ/import-type fix)

## Files changed
- `packages/core/src/util/self-awareness.ts` (new)
- `packages/engine/src/agent/agent.ts`
- `packages/engine/src/session/tools.ts` (syntax fix)
- `packages/engine/src/tool/edit.ts`
- `packages/engine/src/tool/write.ts`
- `packages/engine/src/tool/apply_patch.ts`
- `packages/engine/src/tool/file-edit-guard.ts`
- `packages/engine/src/tool/mutation-permission.ts` (new)
- `packages/engine/test/tool/mutation-permission.test.ts` (new)
- `packages/ml/package.json`
- `packages/ml/src/classifier.ts`
- `packages/ml/src/classifier.test.ts`
