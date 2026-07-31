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

- [x] TUI suite rerun at `e7cc8da6` → **434/434 pass, 1 skip** ✅ (verified 2026-07-31; bounded per-test timeout, no hang)
- [x] Typecheck → **16/16** ✅
- [x] Build → **8/8** ✅ (engine smoke `0.0.0-phase-d-implementation-202607311750`)
- [x] TUI-2.1 production runner → **135/135** ✅ (sprint report's 137 was pre-AD-02/AD-03)
- [x] Record exact numbers in the freeze report §3 (commits `1ed93b12`, `ae8c7d28`)

**Assignee:** delegated verification subagent (read-only). **DoD:** exact counts returned, no files modified. ✅ COMPLETE

## 1b. RELEASE BLOCKER RB-01 — approval pipeline not wired into production

Verified by source inspection (delegated accuracy check + main-agent confirmation):

- Engine (`packages/engine/src`): zero imports of approval lifecycle / operator service / governed executor / approval store. No runtime path creates durable ApprovalRecords.
- TUI route (`routes/session/index.tsx:1535-1590`): `shellProps` omits `approvals`, `approvalController`, `activeSessionId`, `activeWorkspaceId`. `useApprovalIntegration` unused by production code.
- Consequence: real TUI shows no approval entries; `a`/`d`/`v`/`Esc` no-op. WS1 phases 2-7/10-11 blocked.
- The isolated stack (adapter/controller/service/store/executor) is complete and tested — the gap is WIRING both ends.

**Fix tasks (code — operator permission REQUIRED before any modification):**

| # | Task | File(s) |
|---|------|---------|
| RB-01a | Route consequential tool requests through the durable approval lifecycle: create ApprovalRecord → operator decision → governed executor → receipt + RunProof update | `packages/engine/src` (processor/kernel/action path) |
| RB-01b | TUI route: consume approval records + construct `useApprovalIntegration` controller, pass all four shell props | `packages/tui/src/routes/session/index.tsx`, `approval-integration.ts` |
| RB-01c | Delete or update stale `__tests__/run-tui2.1-production-tests.ts` (dead code, asserts removed receipts) | `packages/core/src/crypto/__tests__/` |

**Polish items (M1-M7)** from the freeze report §4 ride along: PENDING glyph `◇` vs doc `◤` (glyph collision), stale receipt lines in doc, version 0 vs 1, truncated hash, no inspector panel, no visible SUBMITTING.

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

## 7. WS5 — Performance + communication hygiene (operator request, added to milestones TUI-1.6)

Thresholds are DEFINED BEFORE measuring (playbook §24 gates):

| Metric | Threshold |
|--------|-----------|
| Session-open → input-ready p95 (warm daemon) | < 500 ms |
| Input echo p95 | < 16.7 ms |
| First model token p95 (excl. provider latency) | < 1 s |
| Redundant requests / 5-min session | 0 |
| SSE reconnect rate | ≤ 1/sec, exponential backoff + jitter |
| Sustained idle network traffic | 0 |

### WS-P1 — Startup and session-open latency

| # | Task | Evidence |
|---|------|----------|
| P1-1 | Instrument the boot path: daemon spawn (currently ~9 health polls before ready, sprint report §6c), TUI shell, session hydration | timing marks boot→prompt, prompt→input-ready |
| P1-2 | Move daemon spawn/health polling off the input path (async; prompt usable before engine ready) | no input block during spawn |
| P1-3 | Progressive hydration: prompt accepts input before session sync completes; optimistic user message already synthesized (routes/session/index.tsx getParts) — extend to send-before-sync | type→Enter→submit works mid-hydration |
| P1-4 | Optimistic echo: typed text visible immediately (no round-trip); first model token starts while hydration continues | echo p95, first-token p95 |
| P1-5 | Fix violations found by measurement | gate results |

### WS-P2 — Communication hygiene (no congestion, no rate-limit bugs)

| # | Task | Evidence |
|---|------|----------|
| P2-1 | Request inventory audit: every network path (health polls, SSE connect/reconnect, session sync, part/message reads, model/tool calls, approval endpoints) — one row each, trigger, cadence, dedup state | audit table in doc |
| P2-2 | SSE discipline: single connection per session, capped reconnect attempts, exponential backoff + jitter, no reconnect storms | reconnect log, cap proof |
| P2-3 | Diff-aware reads: no refetch of unchanged messages/parts (identity/diff checks); verify the L2 spine cache + sync paths | redundant-request counter = 0 |
| P2-4 | Model/tool API discipline: per-session request budget, idempotency keys, 429/503 honored with backoff — never blind retry | budget + backoff tests |
| P2-5 | Idle-traffic proof: 5-minute idle session with no streaming → zero network activity | packet/request log |
| P2-6 | Regression gate: request-amplification test (one logical action → one network effect) | test in suite |

**Assignee:** delegated subagents (audit + implement) with operator verification of P1-2/P1-3 in the real TUI. **DoD:** all thresholds measured and recorded; violations fixed; gates pass.

### P2-1 audit results (2026-07-31, read-only scan at HEAD)

| # | Network path | Location | Trigger | Cadence | Dedup/guard state | Verdict |
|---|--------------|----------|---------|---------|-------------------|---------|
| 1 | Daemon health poll (boot) | `engine/src/cli/cmd/tui.ts:186` | TUI launch, no daemon | 200 ms × max 30 (6 s worst case) | lock file + healthCheck; exits on first ready | ⚠️ P1-1/P1-2 target: blocks TUI shell on input path |
| 2 | SSE event stream (session) | `tui/src/context/sdk.tsx:116-167` | TUI mount | 1 connection, reconnect 1 s→5 s capped exp backoff, `while(true)` | `sseMaxRetryAttempts: 0` (SDK) + TUI-loop backoff; single connection (abort prior) | ✅ meets ≤1/sec threshold; unbounded attempts = deliberate (local daemon may restart) |
| 3 | Editor server WS | `tui/src/context/editor.ts:276-288` | editor attach | reconnect 1 s→10 s capped exp | single socket guard (`socket !== current`) | ✅ bounded |
| 4 | Session list + project sync | `tui/src/context/sync.tsx:472+` | bootstrap | once per mount; parallel fire | — | ✅ one-shot, parallel (1 RTT saved) |
| 5 | Message/part reads | sync store + spine L2 cache | session switch / SSE events | event-driven, no poll | cache keyed by message id; `EMPTY_PARTS` stable ref | ✅ no refetch of unchanged data |
| 6 | LSP status | `sync.tsx:445` | `lsp.updated` event only | event-driven | — | ✅ no poll loop |
| 7 | Model/tool calls | `llm/` + `engine/session/llm/` | per turn | per request | **no retry layer** — 429/503 map to typed errors (`map-upstream.ts:77,115`), fail closed | ⚠️ P2-4 candidate: no blind retry (good), but no bounded retry+backoff for transient 429/503 (resilience gap) |
| 8 | Approval endpoints | `engine/src/server/.../approval.ts`, TUI bridge | operator key press | 1 POST per command; SSE `approval.updated` pushes | sync store upsert by approvalId; command carries expectedVersion/hash (idempotent guard) | ✅ one action → one effect |
| 9 | UI timers (metrics bar 1 s, dots, shimmer, scroll poll) | various components | render lifecycle | local intervals | cleanup on unmount | ✅ no network traffic |
| 10 | Daemon lock cleanup | `daemon/lock` | stale lock detection | on launch only | stale-check before reuse | ✅ |

**Verdict:** No request-amplification bugs found in the scan. The two actionable items are the daemon boot poll (P1-1/P1-2 — also the operator's startup-latency complaint) and the missing LLM retry/backoff layer (P2-4 resilience, deliberately absent so no storm risk). SSE reconnect discipline meets the WS5 threshold already.

---

## Task assignments

| Task | Assignee | Read-only? | Permission needed? |
|------|----------|-----------|--------------------|
| T1: automated re-verification | delegated subagent | YES | no |
| T2: smoke runbook accuracy check | delegated subagent | YES | no |
| H1/H2: repro tests | operator decision → me | — | YES |
| H3: session-lock restore | me | — | YES |
| H4: dompurify bump | delegated implementer (after approval) | no | YES |
| WS-P1: startup/session-open perf | delegated subagents + operator verify | mixed | no (docs/measurement) |
| WS-P2: communication hygiene | delegated subagents | mixed | no (docs/measurement) |
| WS1/2/3: manual | operator (user) | — | — |
| Freeze tag + report finalize | me | — | operator authorization |
