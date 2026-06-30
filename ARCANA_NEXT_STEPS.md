# Arcana Handoff

Current branch: `architecture/active-runproof-binding`

Goal: Arcana becomes the governed execution cockpit for AI agents. The current work is moving the repo toward RunProof-backed execution: live evidence, risk gates, command hygiene, active proof surfaces, rollback, and provider/model accountability.

## Committed Since Last Handoff

- `chore: command hygiene cleanup — remove stale prompt file, update rollback wording and /sovereignty copy`
- `feat: RunProof shell-command evidence and cwd-aware save`
- `feat: evaluate shell-command policy risk in ProofRuntime`
- `feat: render shell-command evidence in TUI /actions timeline`
- `fix: record shell commands post-hoc with approval context`
- `fix: TUI contrast fallbacks`
- `fix: Show RunProof rollback validity in TUI`
- `fix: Add rollback restore copy action`
- `feat: Stage rollback restore behind RunProof approval`
- `feat: Stage active rollback restore from TUI`
- `feat: Capture rollback restore approval`

## Current Dirty Scope

- None expected after this handoff commit.

## Product Status

Command hygiene:

- Removed stale `.opencode/command-registry-alignment-undesired-code.md`.
- Confirmed there are no active `.opencode/command/**` or `.claude/commands/**` Arcana prompt-template command files in the main repo.
- Changed stale guard-search wording:
  - old rollback-ready wording now says `rollback status`
  - `/sovereignty` title/desc now say provider/model route evidence.

RunProof shell evidence:

- Restored only the intended shell-command evidence files from `stash@{6}`:
  - `packages/arcana/src/agent/types.ts`
  - `packages/arcana/src/agent/runner.ts`
  - `packages/arcana/src/cli/run/proof-runtime.ts`
  - `packages/arcana/src/cli/run/proof-runtime.test.ts`
- Added optional `proofGate.recordShellCommand(...)` hook to agent config.
- Agent runner records shell tool outcomes into RunProof after execution.
- `ProofRuntime.recordShellCommand(...)` delegates to `ProofManager.recordShellCommand(...)`.
- `ProofRuntime.recordShellCommand(...)` now evaluates the command through the shell policy gate and replaces `risk: "unknown"` with the real policy risk.
- `ProofRuntime.recordShellCommand(...)` now passes `approved: true` to the policy gate because the command has already been executed; this avoids mis-recording approved/godlike commands as pending approval.
- `ProofManager.save()` now passes `cwd: this.proof.repo.path` so run proof artifacts save under the run cwd instead of the process cwd.
- TUI `/actions` timeline now normalizes and renders `execution.shell_commands` with status and risk.

## QA Status

Passed:

- Arcana prompt-template guard search over the main repo, excluding `.claude/worktrees/**`.
- `rg -n "Cockpit:|cockpit\.|Switched to cockpit|/ \$\{cmd\}" packages/tui/src`
- `rg --files --glob '!.claude/worktrees/**' .opencode .claude | rg "(^|[\\/])(command|commands)([\\/]|$)|\.md$"`
- `bun --cwd packages/tui typecheck`
- `bun test packages/engine/src/kernel/tui-projection.test.ts`
- `bun run --filter @arcana/engine typecheck`
- `bun test packages/arcana/src/proof/proof-manager.test.ts`
- `bun test packages/arcana/src/cli/run/proof-runtime.test.ts`
- `bun node_modules/.bun/typescript@5.8.2/node_modules/typescript/bin/tsc -p packages/arcana/tsconfig.json --noEmit`

Resolved in this slice:

- Fixed `bun test packages/tui` from the repo root by adding a root `bunfig.toml` test preload (`scripts/tui-test-preload.ts`) that registers the OpenTUI Solid transform for `packages/tui`, `packages/engine`, and Solid server files. The package-level `bunfig.toml` preload is not applied by Bun when running `bun test <pattern>` from the repo root, so the root preload bridges the gap.
- `packages/tui` now passes its full suite: 206 pass, 1 skip, 0 fail across 44 files.
- Optimized TUI reactivity hot paths without deleting functionality:
  - `packages/tui/src/routes/session/index.tsx`: combined repeated `messages()` scans (`userMessageIDs`, `pending`, `lastAssistant`, `assistantDuration`) into single-pass memos; replaced per-message duration scan in `AssistantMessage` with a precomputed Map; rewrote `findNextVisibleMessage` to build a single `Set` of visible IDs instead of scanning children against messages.
  - `packages/tui/src/ui/dialog-select.tsx`: replaced remeda `pipe`/`groupBy`/`flatMap`/`filter` with native Map/loops for grouping, flattening, filtering, and row counting; precomputed `flatIndexByOption` and `currentIndex`; added `fastEqual` short-circuit for per-row selection comparisons; replaced per-row mouse-handler scans with Map lookups.
  - `packages/tui/src/routes/session/index.tsx`: converted per-message `UserMessage` and `AssistantMessage` array helpers (`text`, `files`, `compaction`, task-tool presence) to native loops and memos.
  - `packages/tui/src/component/command-palette.tsx`: memoized the command-palette option list and made it depend on the dialog's reactive filter, so `DialogSelect` no longer receives a brand-new options array every render.

Committed TUI contrast fallback slice:

- `packages/tui/src/ui/dialog.tsx`: dimmer overlay derives from theme background luminance instead of fixed black.
- `packages/tui/src/ui/dialog-select.tsx`: inactive option/action rows use an opaque theme fallback when backgrounds are transparent.
- `packages/tui/src/component/dialog-retry-action.tsx`: inactive retry action buttons use an opaque theme/text-overlay fallback instead of transparent black.
- `packages/tui/src/component/error-component.tsx`: fatal error UI uses theme tokens when available, with mode-based emergency fallbacks outside `ThemeProvider`.
- `packages/tui/src/ui/spinner.ts`: public scanner defaults derive from explicit color, theme primary/text, or neutral fallback instead of red/dark-red hardcoded defaults.
- `packages/tui/src/feature-plugins/system/which-key.tsx`: system which-key plugin reads resolved theme tokens directly instead of hardcoded hex fallbacks.
- `packages/tui/src/component/logo.tsx`: logo peak highlight switches black/white by ink luminance instead of always white.
- `packages/tui/src/context/theme.tsx`: exports `ThemeContext` for optional theme reads outside normal provider flow.
- `changes-tui-contrast-fallbacks.md`: documents the contrast fallback slice and QA.

Additional current QA passed for this dirty slice:

- `bun --cwd packages/tui typecheck`
- `bun run --filter @arcana/engine typecheck`
- `bun test packages/tui --timeout 120000` — 206 pass, 1 skip, 0 fail
- `bun test packages/engine/test/cli/run/footer.view.test.tsx --timeout 120000` — 22 pass, 5 skip, 0 fail
- `bun test packages/engine/test/cli/run/theme.test.ts --timeout 120000` — 7 pass, 0 fail
- `rg -n 'RGBA\.fromInts\(0, 0, 0, 0\)|RGBA\.fromInts\(0, 0, 0, 150\)|#ff0000|#330000' packages/tui/src/ui packages/tui/src/component packages/tui/src/feature-plugins/system packages/tui/src/context` — no matches

Committed rollback TUI slice:

- `packages/tui/src/app.tsx` now preserves `proof.rollback.valid_until` while normalizing the active RunProof.
- `/contract`, `/actions`, and `/diffgate` display rollback validity when present.
- `packages/tui/src/app.tsx` now exposes a copy action for explicit `proof.rollback.restore_command` values in the existing RunProof-backed dialogs.
- The copy action only appears when the active proof has an executable `rollback.restore_command`; it does not copy prose fallback text from `contract.rollback_plan`.
- QA passed:
  - `bun --cwd packages/tui typecheck`
  - fake cockpit command search over `packages/tui/src`
  - active-proof scan guard over `packages/tui/src/app.tsx`
  - `git diff --check`

Committed rollback restore copy slice:

- Commit: `5b34ecb Add rollback restore copy action`
- File changed:
  - `packages/tui/src/app.tsx`
- Behavior:
  - `/contract`, `/actions`, and `/diffgate` keep using the existing RunProof-backed dialog surfaces.
  - When `proof.rollback.restore_command` is present, the dialog shows `copy restore command`.
  - Clicking the action writes the exact restore command to the clipboard and shows `Copied rollback restore command`.
  - No rollback command is executed by the TUI.
  - No fallback to latest proof files was added.
  - No new command system, registry, or prompt-template command was added.
- QA passed:
  - `bun --cwd packages/tui typecheck`
  - `rg -n "Cockpit:|cockpit\.|Switched to cockpit|/ \$\{cmd\}" packages/tui/src` — no matches
  - `rg -n "readdir|mtime|latest|sort" packages/tui/src/app.tsx` — only local `latestTurnEvidence` ML evidence naming matched, no proof-file scan
  - `git diff --check`

Committed rollback staging semantics slice:

- Files changed:
  - `packages/arcana/src/proof/types.ts`
  - `packages/arcana/src/proof/create.ts`
  - `packages/arcana/src/proof/compat.ts`
  - `packages/arcana/src/proof/proof-manager.ts`
  - `packages/arcana/src/proof/render.ts`
  - `packages/arcana/src/proof/proof-manager.test.ts`
  - `packages/tui/src/app.tsx`
- Behavior:
  - RunProof rollback now carries `restore_status`, `staged_at`, `approval_required`, `approved_at`, and `approved_by`.
  - New proofs default rollback restore state to `not_staged` with approval required before execution.
  - Legacy/older proof normalization fills missing rollback restore state without breaking existing RunProof 0.1 data.
  - `ProofManager.stageRollbackRestore()` records `rollback.staged`, raises risk to at least `high`, adds `rollback restore execution` to required approvals, and never executes the restore command.
  - Markdown, terminal render, and replay output expose rollback restore status and approval requirement.
  - Existing `/contract`, `/actions`, and `/diffgate` surfaces show restore status and approval state from active RunProof data.
- QA passed:
  - `bun test packages/arcana/src/proof/proof-manager.test.ts` — 14 pass
  - `bun node_modules/.bun/typescript@5.8.2/node_modules/typescript/bin/tsc -p packages/arcana/tsconfig.json --noEmit`
  - `bun --cwd packages/tui typecheck`
  - `rg -n "Cockpit:|cockpit\.|Switched to cockpit|/ \$\{cmd\}" packages/tui/src` — no matches
  - `git diff --check`

Committed active rollback staging TUI slice:

- File changed:
  - `packages/tui/src/app.tsx`
- Behavior:
  - Existing `/contract`, `/actions`, and `/diffgate` RunProof dialogs now expose `stage restore for approval` when the active proof has `rollback.restore_command` and is not already staged.
  - The action writes only to `ARCANA_ACTIVE_RUNPROOF_PATH`; it does not scan `.arcana/proofs`, does not use latest-file fallback, and does not execute the restore command.
  - Staging persists `rollback.restore_status = "staged"`, `rollback.staged_at`, `rollback.approval_required = true`, raises risk to at least `high`, adds `rollback restore execution` to required approvals, and appends a `rollback.staged` event.
  - After staging, the same proof-backed dialog reloads from the active RunProof path.
  - `@arcana/tui` still does not depend on the proof package; this remains a narrow active-proof JSON bridge until the TUI has a proper RunProof service boundary.
- QA passed:
  - `bun --cwd packages/tui typecheck`
  - `bun node_modules/.bun/typescript@5.8.2/node_modules/typescript/bin/tsc -p packages/arcana/tsconfig.json --noEmit`
  - `bun test packages/arcana/src/proof/proof-manager.test.ts` — 14 pass
  - `rg -n "Cockpit:|cockpit\.|Switched to cockpit|/ \$\{cmd\}" packages/tui/src` — no matches
  - `rg -n "readdir|mtime|latest|sort" packages/tui/src/app.tsx` — only local `latestTurnEvidence` ML evidence naming matched, no proof-file scan

Committed rollback approval capture slice:

- Files changed:
  - `packages/arcana/src/proof/types.ts`
  - `packages/arcana/src/proof/proof-manager.ts`
  - `packages/arcana/src/proof/render.ts`
  - `packages/arcana/src/proof/proof-manager.test.ts`
  - `packages/tui/src/app.tsx`
- Behavior:
  - RunProof now records `rollback.approved` as a distinct ledger event.
  - `ProofManager.approveRollbackRestore()` requires a staged restore, sets `restore_status = "approved"`, clears `approval_required`, captures `approved_at`/`approved_by`, and does not execute the restore command.
  - Markdown, terminal render, and replay output expose rollback approval evidence.
  - Existing `/contract`, `/actions`, and `/diffgate` dialogs show `approve restore` only for staged rollback restores.
  - TUI approval writes only to `ARCANA_ACTIVE_RUNPROOF_PATH`, appends `rollback.approved`, reloads the active proof, and still does not execute rollback.
- QA passed:
  - `bun test packages/arcana/src/proof/proof-manager.test.ts` — 15 pass
  - `bun node_modules/.bun/typescript@5.8.2/node_modules/typescript/bin/tsc -p packages/arcana/tsconfig.json --noEmit`
  - `bun --cwd packages/tui typecheck`
  - `rg -n "Cockpit:|cockpit\.|Switched to cockpit|/ \$\{cmd\}" packages/tui/src` — no matches
  - `rg -n "readdir|mtime|latest|sort" packages/tui/src/app.tsx` — only local `latestTurnEvidence` ML evidence naming matched, no proof-file scan

## Stashes

The previous broad dirty tree was preserved in:

- `stash@{6}` at the time of this handoff: `wip clean tree before continuing arcana goal`

Nested `.claude/worktrees` changes were preserved in separate stashes `stash@{0}` through `stash@{5}` at the time the tree was cleaned. Stash numbering changes after new stash operations.

## Next Steps

1. Keep `/contract` and `/actions` bound only to the active RunProof path (`ARCANA_ACTIVE_RUNPROOF_PATH`). Do not introduce latest-proof scans.
2. Continue wiring real RunProof data before expanding `/diffgate`, `/verify`, or `/sovereignty` behavior.
3. Avoid new command registries or prompt-template command systems.
4. Remaining product gaps to close in priority order:
   - Rollback: add a guarded restore execution path only after approval, with command evidence and rollback execution event capture.
   - Provider/model accountability: ensure `recordModelRoute` evidence is captured and shown only when `/sovereignty` is backed by real data.
   - Diff/verify gates: wire verification results (`typecheck`, `lint`, `build`, tests) into RunProof before surfacing `/verify` and `/diffgate`.
5. Keep TUI tests green when touching session/dialog components; the root preload now makes `bun test packages/tui` the single source of truth for TUI QA.
6. Keep the tree clean between slices; do not stage restored stash or worktree files unless a future slice explicitly scopes them in.
