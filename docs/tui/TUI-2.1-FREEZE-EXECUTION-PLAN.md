# TUI-2.1 Freeze Execution Plan

**Date:** 2026-07-31
**Branch:** `phase-d-implementation`
**Candidate:** `e7cc8da6` (+ docs `1ed93b12`)
**Authority:** `ARCANA_PHASES_100_PERCENT_COMPLETION_PLAYBOOK.md` §23-24 (TUI 1.0) + `TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md` (milestone contract)
**Status:** IN EXECUTION

---

## 0. Current position

| Gate | Status |
|------|--------|
| Phase C | FROZEN ✅ (`arcana-governed-autonomy-phase-c`) |
| TUI-2.1 production code + mount | COMPLETE ✅ |
| Automated gates | PASS ✅ (rerun at new candidate pending) |
| Streaming lifecycle polish | DONE + OPERATOR VALIDATED ✅ |
| Manual release validation (WS1/WS2/WS3) | PENDING ⏳ |
| Dependabot triage | COMPLETE ✅ (dompurify bump pending) |
| **TUI-2.1 freeze** | **NOT YET AUTHORIZED** ❌ |

The only open gate is manual release validation. Everything below exists to close it with reproducible evidence.

---

## 1. Pre-flight: automated re-verification at new candidate

- [ ] TUI suite rerun at `e7cc8da6` → expect **434/434** (bounded per-test timeout; a network test hung the suite before)
- [ ] Typecheck → **16/16**
- [ ] Build → **8/8**
- [ ] Record exact numbers in the freeze report §3

**Assignee:** delegated verification subagent (read-only). **DoD:** exact counts returned, no files modified.

---

## 2. Housekeeping (permission-gated — operator must approve each)

| # | Item | Type | Action |
|---|------|------|--------|
| H1 | `packages/tui/test/chat-shimmer-render-repro.test.tsx` (untracked) | code | commit as regression test OR delete |
| H2 | `packages/tui/test/streaming-lifecycle-repro.test.ts` (untracked) | code | commit as regression test OR delete |
| H3 | `packages/engine/.arcana/.session-lock` (dirty) | runtime artifact | restore to HEAD (needs operator permission) |
| H4 | dompurify 3.4.11 → 3.4.12 (`packages/ui/package.json`) | dependency | PATCH BEFORE MERGE per WS4 triage |
| H5 | nitro update in `packages/enterprise/enterprise` | dependency | separate `security/dependabot-remediation` PR, not freeze-blocking |

**DoD:** H1/H2 decided; H3 clean; H4 landed; H5 branched.

---

## 3. WS1 — Manual smoke test (operator-driven, 11 phases)

Runbook: `docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md` (accuracy-checked against code by delegated verification subagent).

| Phase | Checkpoints |
|-------|-------------|
| 1 | Startup — clean boot, no stale branding, spine renders, prompt usable |
| 2 | Trigger approval — glyph `◤`, label `approval required`, summary `<hash-prefix> · exact request required`, expanded, no duplicate |
| 3 | Inspector — `v` opens full values; `Esc` closes to SELECTED; second `Esc` clears selection |
| 4 | Approval lifecycle — `a` → SUBMITTING → `✓ approved once · operator` → `▷ claimed · execution <id>` → `▣ consumed · execution <id>` + `authority approval consumed · 0 uses` |
| 5 | Denial lifecycle — `d` → zero executor calls, DENIED receipt |
| 6 | Prompt conflict protection — typing cannot trigger approval shortcuts |
| 7 | Session isolation — switching sessions clears stale selection |
| 8 | Resize — 9 breakpoints: 59/60/79/80/99/100/119/120/180 |
| 9 | Theme — dark + light, status not color-alone |
| 10 | Restart recovery — durable state reconstructs, no optimistic rows |
| 11 | Mouse — selection + keyboard action parity |

**Recording:** each checkpoint `PASS` / `FAIL -- RELEASE BLOCKER` / `FAIL -- POLISH BLOCKER` / `FAIL -- NON-BLOCKING` / `NOT TESTED -- reason`. Operator records in the runbook + freeze report §4.

**DoD:** 11/11 phases recorded, zero RELEASE BLOCKERs.

---

## 4. WS2 — Lifecycle rendering evidence

Observe in real runtime with real tool execution: requested / running / completed / failed / denied / approval-required / approved / claimed / consumed / retried / interrupted.

- [ ] One spine entry per action, chronological, no duplicate receipts
- [ ] Bounded long output; completion does not obscure the request
- [ ] Restart reconstruction

**DoD:** all 11 states observed + recorded in freeze report §5.

---

## 5. WS3 — Theme, width, performance

- [ ] WS3a theme matrix — dark/light, 11 elements, status-not-color-alone (freeze report §6)
- [ ] WS3b width matrix — 9 breakpoints × (right-edge, rail, prompt, approval, inspector) (freeze report §7)
- [ ] WS3c performance — thresholds defined BEFORE measuring: no typing lag, no idle CPU, no multi-second scroll stalls, bounded rendered entries (viewport culling), no continuous memory growth (freeze report §8)

**DoD:** all three matrices recorded.

---

## 6. Freeze authorization

When WS1 + WS2 + WS3 + H4 all pass:

- [ ] Update freeze report: all gates → PASS, evidence attached
- [ ] Full automated suite rerun (final, after H4)
- [ ] Tag `arcana-tui-2.1` at final HEAD
- [ ] Operator authorizes freeze; milestone contract updated to FROZEN
- [ ] Unblock TUI-3 (subagent console, playbook TUI-1.3)

---

## Task assignments

| Task | Assignee | Read-only? | Permission needed? |
|------|----------|-----------|--------------------|
| T1: automated re-verification | delegated subagent | YES | no |
| T2: smoke runbook accuracy check | delegated subagent | YES | no |
| H1/H2: repro tests | operator decision → me | — | YES |
| H3: session-lock restore | me | — | YES |
| H4: dompurify bump | delegated implementer (after approval) | no | YES |
| WS1/2/3: manual | operator (user) | — | — |
| Freeze tag + report finalize | me | — | operator authorization |
