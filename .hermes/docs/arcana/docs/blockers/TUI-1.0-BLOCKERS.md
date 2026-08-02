# TUI 1.0 — Governed Operator Console: Blocker Register

**Status: TUI-2 FROZEN (`arcana-tui-2-interactive-authority-control`);
TUI-2.1 MOUNTED and AUTOMATED GREEN, freeze NOT AUTHORIZED.**

The open blockers below are exactly the TUI-2.1 freeze gates from
`docs/tui/TUI-2.1-FREEZE-OPERATOR-RUNBOOK.md` plus the remaining product-track
items (TUI-3 delegation console, TUI-4 proof/replay/audit views, TUI-5
final polish) that are outside the TUI-2.1 scope.

## Open blockers

| ID | Blocks | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-TUI-01 | Runbook Gate 1 — manual Windows Terminal smoke (11 phases, >50 checkpoints) | Manual matrix not executed at the final commit; partial observations recorded in the freeze sign-off (startup, contract admission, governance aggregation, proof axes, tool execution, gate approval, denial with zero effects, restart durability) | Signed 11-phase checklist at the exact final commit |
| BLK-TUI-02 | Runbook Gate 2 — width matrix 59–180 | No width matrix run | Matrix at 59/60/79/80/99/100/119/120/180 with zero right-edge clipping |
| BLK-TUI-03 | Runbook Gate 3 — dark/light theme matrix | No theme matrix run | All approval/tool/spine states in both themes; security states never color-only |
| BLK-TUI-04 | Runbook Gate 4 — approval lifecycle via spine keys | `v`/`a`/`d` lifecycle (PENDING→APPROVED→CLAIMED→CONSUMED) not yet observed in a live session; F-23 implemented and unit-tested | Operator-observed lifecycle incl. exact request inspector, prompt-conflict check |
| BLK-TUI-05 | Runbook Gate 6 — restart recovery + session isolation | Durable re-hydration observed for session/contract/proof; approvals re-hydration and per-session isolation not yet observed | Restart + isolation checkpoints passed |
| BLK-TUI-06 | Runbook Gate 7 — 6-checkpoint live-stream validation | Stream fixes implemented; live protocol not run (probe documented in the sign-off) | 6/6 checkpoints PASS at the final commit |
| BLK-TUI-07 | Runbook Gate 8 — performance measurements | No typed-lag/idle-CPU/scroll/memory measurements at final commit | p95 input echo < 16.7 ms, session-open to input-ready < 500 ms (warm daemon), no redundant requests/reconnect storms/idle traffic |
| BLK-TUI-08 | Runbook Gate 9/10 — exact-commit rerun + zero blockers | Current runs are at the working tree, not a committed final commit | Full suite rerun green at the tagged commit; sign-off |

## Closed TUI blockers (2026-08-01/02)

| ID | Blocker | Fix |
|---|---|---|
| F-15 | OpenTUI 0.4.5 compiled-binary worker-path crash (TUI would not open) | `script/patch-opentui.ts` postinstall patch |
| F-16 | Daemon boot crash: obligation_templates seed UNIQUE violation | idempotent seed |
| F-17 | Governance/proof rows rendered as chat cards when healthy | spine mapper fix |
| F-18 | Completion gate idempotency per-session, not per-contract | per-contract idempotency + test |
| F-19 | Criteria receipts never emitted in production | PEP `test_receipt`/`build_receipt` emission |
| F-20 | RunProof hid operator-rejected executions | rejection evidence recorded |
| F-21 | Proof/governed rows swapped order on live updates | stable ordering + regression test |
| F-22 | Daemon idle-stop left TUI with "Failed to send prompt / Unable to connect" | daemon respawn (`packages/engine/src/cli/cmd/tui.ts`, `packages/tui/src/context/sdk.tsx`, `daemon-respawn.test.ts`) |
| F-23 | Approval inspector invisible + spine keys unreachable from keyboard | `approval-inspector.tsx`, command-spine key handling, `approval-inspector.test.ts` |

## Known residual TUI issues (documented, not blocking the automated gate)

- Permission-gate rows (`◤`) intentionally disappear after decision — this is
  correct behavior, not a defect; durable approvals persist with
  `· exact request required`.
- `No full diff is attached to this spine entry` appears for entries without
  diff payloads by design.
- The LLM-composer connection error path ("Failed to send prompt / Unable to
  connect") is mitigated by F-22 but must be re-verified through the
  live-stream protocol.
