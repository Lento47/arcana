---
tags: [security, budgets, safety, execution]
date: 2026-06-21
source: session-hardening-15-failure-modes
---

# Run Budgets — Per-Session Safety Limits

**Rule:** Every run has hard safety budgets. Exceeding any budget pauses the run. No single session can touch more than 50 files, run more than 5 destructive operations, change more than 2000 LOC, make more than 10 external calls, or run longer than 15 minutes.

**Scope:** `packages/engine/src/session/budget.ts` — `SessionBudget.Service`. Integrated into `session/prompt.ts` run loop. Tracked in `session-data.ts` `SessionBudget` type.

**Reason:** A malicious or runaway model could theoretically touch unlimited files, execute unlimited dangerous commands, or run indefinitely. Hard budgets provide defense-in-depth that doesn't rely on model cooperation or prompt engineering.

## Budget Limits

| Budget | Limit | Tracked By |
|---|---|---|
| Destructive ops | 5 per run | `recordDestructive()` — counts bash commands, write/edit with dangerous content |
| Files touched | 50 per run | `recordFileTouch()` — counts write/edit/apply_patch operations |
| LOC changed | 2000 per run | `recordLocChange()` — counts insertions + deletions in diffs |
| External calls | 10 per run | `recordExternalCall()` — counts webfetch, websearch, curl/wget |
| Duration | 15 minutes | `checkDuration()` — compares against `startTime` |

## Behavior on Exceeded

- Run is paused (remaining tool calls blocked with `BudgetExceededError`)
- TUI shows: `[BUDGET] Destructive ops: 5/5 — limit reached. Run paused.`
- User can: `/budget off` to disable, `/budget status` to view current counters
- Budgets reset on each new session

## Integration

`SessionBudget.Service` uses Effect-TS `InstanceState` for mutable per-session state (matches existing service pattern). Budget checks happen in the `runLoop` in `session/prompt.ts` before each step iteration.

## TUI Display

`formatBudgetStatus()` in `session-data.ts` produces the `[BUDGET]` status text. The footer status bar shows budget warnings inline.

## History

- 2026-06-21: Implemented as failure mode #11 (hostile model defense). New module `session/budget.ts`.

## Related

- [[ghost-preview-system]] — Risk labels are the first line of defense; budgets are the second
- [[prompt-injection-guard]] — Different defense layer against different attack vector
- [[session-lock]] — Concurrent session protection at the OS level

Related: [[arcana-governance-model-location]] [[arcana-shell-execution-goal-gate]] [[arcana-security-model]] [[demo-gated-actions-via-minimal-goal]] [[shell-run-before-binding-goal]] [[arcana-evalcondition-bypass]] [[arcana-audit-baseline]] [[governed-codebase-audit-method]]
