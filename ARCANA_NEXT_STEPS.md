# Arcana Handoff

Current branch: `architecture/active-runproof-binding`

Goal: Arcana becomes the governed execution cockpit for AI agents. The current work is moving the repo toward RunProof-backed execution: live evidence, risk gates, command hygiene, active proof surfaces, rollback, and provider/model accountability.

## Committed Since Last Handoff

- `chore: command hygiene cleanup — remove stale prompt file, update rollback wording and /sovereignty copy`
- `feat: RunProof shell-command evidence and cwd-aware save`
- `feat: evaluate shell-command policy risk in ProofRuntime`
- `feat: render shell-command evidence in TUI /actions timeline`
- `fix: record shell commands post-hoc with approval context`

## Current Dirty Scope

- `ARCANA_NEXT_STEPS.md` only (this handoff file)

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

## Stashes

The previous broad dirty tree was preserved in:

- `stash@{6}` at the time of this handoff: `wip clean tree before continuing arcana goal`

Nested `.claude/worktrees` changes were preserved in separate stashes `stash@{0}` through `stash@{5}` at the time the tree was cleaned. Stash numbering changes after new stash operations.

## Next Steps

1. Keep `/contract` and `/actions` bound only to the active RunProof path (`ARCANA_ACTIVE_RUNPROOF_PATH`). Do not introduce latest-proof scans.
2. Continue wiring real RunProof data before expanding `/diffgate`, `/verify`, or `/sovereignty` behavior.
3. Avoid new command registries or prompt-template command systems.
4. Remaining product gaps to close in priority order:
   - Rollback: ensure rollback checkpoints created by `proof-manager` are visible in `/contract` and can be staged from the TUI.
   - Provider/model accountability: ensure `recordModelRoute` evidence is captured and shown only when `/sovereignty` is backed by real data.
   - Diff/verify gates: wire verification results (`typecheck`, `lint`, `build`, tests) into RunProof before surfacing `/verify` and `/diffgate`.
5. Keep TUI tests green when touching session/dialog components; the root preload now makes `bun test packages/tui` the single source of truth for TUI QA.
