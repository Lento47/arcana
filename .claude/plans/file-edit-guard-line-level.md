# Plan: Line-Level File Edit Guard Improvements

## Goal
Make Arcana's file-mutation guard smarter about *how* a file is changed, not just *how much*. Today the guard is line-count/ratio based; the goal is to detect and flag destructive patterns like whole-block deletion, massive block insertion, file deletion/move, and permission-policy edits with stable rule IDs that the TUI can render clearly.

## Background
The current guard lives in three layers:
- `packages/engine/src/tool/file-edit-guard.ts` — thresholds (`largeChangeLines`, `wholesaleThreshold`, `backupThreshold`) + diff stats.
- `packages/engine/src/tool/mutation-permission.ts` — routes edits to `edit` vs `self_awareness` permission classes.
- `packages/engine/src/tool/edit.ts`, `write.ts`, `apply_patch.ts` — consume the helpers and build `ctx.ask` metadata.
- `packages/tui/src/util/permissions-status.ts` + `dialog-permissions.tsx` — render `[WHOLESALE REPLACEMENT]`, `[LARGE CHANGE]`, `[backup created]` chips.

What it does **not** yet do:
- Distinguish "30 small edits across a file" from "delete 100 consecutive lines and paste 100 new ones".
- Identify delete/move operations in `apply_patch` as their own destructive rule.
- Carry stable rule IDs through metadata for the TUI/RunProof to consume.
- Surface `self_awareness`, `permission_policy`, or `destructive_patch` flags in the TUI.

## Proposed Improvements

### 1. Add line-level blast-radius metrics to `DiffStats`
In `packages/engine/src/tool/file-edit-guard.ts`, extend `DiffStats` with:
- `maxConsecutiveAdditions` — longest run of added lines.
- `maxConsecutiveDeletions` — longest run of deleted lines.
- `unchangedPrefixLines` — lines unchanged at start of file (detect leading wholesale rewrite).
- `unchangedSuffixLines` — lines unchanged at end of file.
- `hunkCount` — number of distinct edit sites (added for `edit` tool later; patch already has hunks).

These are computed from the existing `diffLines` output, so no new dependencies.

### 2. Introduce stable destructive-classification rule IDs
Add a `GuardRule` union and `classifyGuard(stats, context)` in `file-edit-guard.ts`:

```ts
export type GuardRule =
  | "WHOLESALE_REPLACEMENT"
  | "LARGE_CHANGE"
  | "BLOCK_DELETION"
  | "BLOCK_INSERTION"
  | "MANIFEST_EDIT"
  | "PERMISSION_POLICY_EDIT"
  | "SELF_AWARENESS_DESTRUCTIVE"
  | "FILE_DELETE"
  | "FILE_MOVE"

export interface GuardClassification {
  rules: GuardRule[]
  destructive: boolean
}
```

Rules are assigned by inspecting `DiffStats`, path type, and operation type:
- `WHOLESALE_REPLACEMENT` — `changeRatio > wholesaleThreshold` and `existingFile`.
- `LARGE_CHANGE` — `totalChanged > largeChangeLines`.
- `BLOCK_DELETION` — `maxConsecutiveDeletions > 20` (configurable) for non-self-awareness files.
- `BLOCK_INSERTION` — `maxConsecutiveAdditions > 30` (configurable) for non-self-awareness files.
- `MANIFEST_EDIT` — `isDependencyManifest(filePath)`.
- `PERMISSION_POLICY_EDIT` — `isPermissionPolicyPath(filePath)`.
- `SELF_AWARENESS_DESTRUCTIVE` — self-awareness path + (`large_change` or `wholesale_replacement`).
- `FILE_DELETE` / `FILE_MOVE` — from `apply_patch` change types.

### 3. Update `mutation-permission.ts` to consume classification
- Replace the boolean `destructive` flag with the `GuardRule[]` array so callers know *why* something is destructive.
- Keep backward-compatible `destructive` boolean as `rules.length > 0`.
- Add a helper `guardRulesForPatch` that aggregates rules across all changes.

### 4. Update tool metadata
- `edit.ts` create/update branches: include `guard_rules` in `ctx.ask` metadata.
- `write.ts`: include `guard_rules`.
- `apply_patch.ts`: include `guard_rules`, `destructive_patch` stays, plus `file_delete`/`file_move` rules.

### 5. Update TUI rendering
- Extend `EditGuardFlags` in `permissions-status.ts` with `destructive_patch`, `permission_policy`, `self_awareness`, `guard_rules`.
- Update `guardWarnings` to render chips like `[BLOCK DELETION]`, `[FILE DELETE]`, `[PERMISSION POLICY]`.
- Update `dialog-permissions.tsx` to use the new flags.

### 6. Refactor duplicated diff/backup logic
- Create `packages/engine/src/tool/mutation-util.ts` with:
  - `computeMutationStats(oldContent, newContent, thresholds)` — returns `DiffStats` + `GuardMetadata` + backup decision.
  - `buildMutationAsk(filePath, relativePath, stats, guard, context)` — returns the `{ permission, patterns, always, metadata }` shape.
- Use it in `edit.ts`, `write.ts`, and `apply_patch.ts` so the three tools don't independently call `analyzeDiff`, `enrichMetadata`, `shouldBackup`, `singleMutationPermission`.

### 7. Update tests
- `packages/engine/test/tool/file-edit-guard.test.ts` — add tests for consecutive-addition/deletion metrics, unchanged prefix/suffix, rule classification.
- `packages/engine/test/tool/mutation-permission.test.ts` — update to assert rule IDs.
- `packages/tui/test/permissions-status.test.ts` — add tests for new guard chips.

## Files to Change
- `packages/engine/src/tool/file-edit-guard.ts`
- `packages/engine/src/tool/mutation-permission.ts`
- `packages/engine/src/tool/mutation-util.ts` (new)
- `packages/engine/src/tool/edit.ts`
- `packages/engine/src/tool/write.ts`
- `packages/engine/src/tool/apply_patch.ts`
- `packages/tui/src/util/permissions-status.ts`
- `packages/tui/src/component/dialog-permissions.tsx`
- `packages/engine/test/tool/file-edit-guard.test.ts`
- `packages/engine/test/tool/mutation-permission.test.ts`
- `packages/tui/test/permissions-status.test.ts`

## Risks / Trade-offs
- New `BLOCK_DELETION` / `BLOCK_INSERTION` thresholds are heuristic. Setting them too low will flag legitimate refactors; too high misses wholesale rewrites. Proposed defaults (20 deleted, 30 inserted) are conservative and can be tuned from env vars.
- Adding rule IDs to TUI metadata is additive and should not break existing approvals.
- The `mutation-util.ts` refactor touches three tool paths; tests must cover all three.

## Verification Plan
- `bun run typecheck` for `packages/engine`, `packages/tui`.
- `bun test test/tool/file-edit-guard.test.ts test/tool/mutation-permission.test.ts`.
- `bun test test/tool/edit.test.ts test/tool/write.test.ts test/tool/apply_patch.test.ts` (if they exist).
- `bun test packages/tui/test/permissions-status.test.ts`.
- Full `bun run test` in `packages/engine`.
