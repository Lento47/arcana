# Arcana Next Steps — TUI-2.1 Freeze + product-track roadmap

**Date:** 2026-08-01 (v2 — aligned to master docs)
**Branch:** `phase-d-implementation` — HEAD `daa37e18`
**Authority docs (MANDATORY, read before executing any step):**
- `Arcana_Project_Master_Specification.md` — §8 TUI (8.3 responsive tiers, 8.4 product track, 8.5 non-negotiable rules, 8.6 quality gate), §4 status
- `ARCANA_PHASES_100_PERCENT_COMPLETION_PLAYBOOK.md` — §23 TUI-1.1..1.7, §24 TUI 1.0 100% gates, §28-32 Phase D (distributed autonomy), §44-46 accounting/latency
- `TUI-2.1-FREEZE-EXECUTION-PLAN.md`, `TUI-2.1-FREEZE-REPORT.md`, `TUI-2.1-STALL-AUDIT-2026-08-01.md`, `TUI-2.1-SSE-STALL-REPORT.md`, `TUI-2.1-MANUAL-SMOKE-TEST.md`, `TUI-2.1-RB01-FIX-SPEC.md`
- Skill: `opentui` (mandatory for any TUI code work — "READ THE DOCS BEFORE CLAIMING BEHAVIOR"; dist in use is 0.4.4 at `packages/tui/node_modules/@opentui/core/`; consolidated reference `docs/opentui-reference.md` in `L:\PROJECTS\arcana`; verified facts: `wrapMode` default `"word"`, `drawUnstyledText` semantics, wrap needs a numeric width)
- SolidJS semantics for store work: the `aedd96dc` lesson (updateMessage passed `msg` by reference — SolidJS `reconcile` saw no diff, streaming never ended; fix was `structuredClone` on publish) applies to any new store merge in F2.

**Milestone mapping (naming alignment):**
- "Phase D" in this repo's branch name is NOT playbook Phase D. Playbook Phase D = Distributed Governed Autonomy (D1-D10, §28-32). The TUI-2.1 work belongs to the **TUI product track** (master spec §8.4 / playbook §23): TUI-2 Interactive governance + TUI-5 Production polish + TUI-1.6 stability/perf. Freeze = playbook §24 gates + master spec §8.6 quality gate.

**Current position (verified 2026-08-01):**

| Gate | Status |
|------|--------|
| P7-P12 live-stream repair | COMMITTED (`50cb832b`→`daa37e18`); stall audit done; fixes F0-F4 pending |
| RB-01 approval pipeline wiring | DONE (`90de367c`→`3833cde0`) — TUI-1.2/TUI-2 core wired |
| RW-01 wrap fix, SSE gap-closer | DONE (`ca73e50e`, `aeb89f53`) |
| Automated gates (TUI 444/444, typecheck 16/16, build 8/8) | PASS |
| WS1/WS2/WS3 manual validation | PENDING (TUI-1.7 + §8.6) |
| WS4 dependabot | dompurify 3.4.12 landed; nitro separate PR (H5) |
| TUI-2.1 freeze | NOT AUTHORIZED |

---

## PHASE A — Live-stall fixes F0-F4 (TUI-1.6 stability blocker)

Source: `TUI-2.1-STALL-AUDIT-2026-08-01.md`. Operator permission REQUIRED. Commit per task, push once at end.

### F0 — TUI: expose the built-in OpenTUI console overlay (superseded v1 file-mirror; see audit v2 F0)
- OpenTUI's console overlay already captures `console.*` in the TUI process (`consoleMode` default `"console-overlay"`, `app.tsx:1724-1737` sets no `consoleMode`). The `[arcana]` lines are captured invisibly.
- Fix: bind `renderer.console.toggle()` to a key (`app.tsx` keymap); dev usage `SHOW_CONSOLE=true` + `OTUI_DUMP_CAPTURES=true` (dump on exit; not on direct `renderer.destroy()`). Docs: `opentui/core-concepts/console.mdx`, `reference/env-vars.mdx`.
- NO new file, NO daemon change. Engine-side logs stay in `opencode.log`.

### F1 — engine: terminal `finish="error"` on every non-clean turn end
- Why: generic error path never sets `finish`; DB-verified `finish=None + error` on BOTH stream-error and abort paths (audit addendum).
- Where: `packages/engine/src/session/processor.ts` — `halt()` `:1148-1167` (copy the `finish="error"` line from the ContextOverflow branch `:1138-1139`); locate the abort path (`error=Aborted`, observed 03:08:05) and stamp the same terminal finish.
- Type check: finish union already includes `"error"` — consumed at `packages/tui/src/shell/command-spine/spine-mapper.ts:1814-1816`.
- Verify: rerun abort → DB `message.data.finish="error"` (`~/.local/share/arcana/opencode-local.db`).

### F2 — TUI: turn-end reconcile (closes the P12 coverage hole)
- Why: exhaustive trigger audit — no reconcile fires on turn lifecycle (triggers only: heartbeat-gap `routes/session/index.tsx:669-675`, missing-part `sync.tsx:473,482`, reconnect `index.tsx:656-659`; `stream-reset`/`manual` declared `sync.tsx:40`, never called).
- Where: `packages/tui/src/context/sync.tsx`:
  - `message.updated` case `:387-427` — after the existing patch, if `finish` ∈ {`stop`,`tool-calls`,`error`} → `reconcile(sessionID, "turn-end")` (existing reconcile `:873-990`; add `"turn-end"` to `ReconcileReason` `:40`).
  - `session.status` case `:366-369` — on `idle`, same (debounced, active session only; reconcile already dedupes `:879-880`).
- SolidJS caution: do NOT pass the live message object into store merges — follow the `aedd96dc` `structuredClone` lesson.
- Tests: errored-turn fires reconcile; status-idle fires once; healthy streaming does not.

### F3 — engine: server keep-alive hygiene
- Where: `packages/engine/src/server/server.ts:210-235` — `createServer({ keepAliveTimeout: 5_000, headersTimeout: 10_000 })`.
- Verify: cold-daemon boot → ESTABLISHED decays to ≤10 within ~15s of idle.

### F4 — TUI/SDK: destroy-not-pool SSE sockets per reconnect (TUI-1.6/WS-P2: "SSE reconnect: capped attempts, backoff, single connection (no reconnect storms)")
- Where: `packages/tui/src/context/sdk.tsx:158-238` — new `AbortController` per attempt, abort prior on stream end (destroy path `packages/sdk` `serverSentEvents.gen.ts:139-145`; clean-EOF pools the socket at `:220`). Complement if cancel does not destroy: `Connection: close` on the SSE response (`handlers/event.ts:167-174`).
- Tests: reconnect N times → each attempt aborts the prior controller.

### PHASE A DoD
F0-F4 implemented + tested + typecheck clean; committed. Confidence 85% → ~90% design-level; the remaining 10% is PHASE B.

---

## PHASE B — Instrumented live validation (the 100% gate for the stall class)

Witness legs: (1) engine `C:\Users\lejze\.local\share\arcana\log\opencode.log` (file logger, `packages/core/src/observability/logging.ts:68`); (2) probe `bun run /l/tmp/probe-sse.ts http://127.0.0.1:9142` → `L:\tmp\probe-live.log`; (3) `tui-console.log` (F0).

**One clean run** (operator): `bun run dev:tui` (plain). Checkpoints recorded `PASS` / `FAIL -- RELEASE BLOCKER` / `FAIL -- POLISH BLOCKER` / `FAIL -- NON-BLOCKING` / `NOT TESTED -- reason`:
1. Normal turn completes; `liveRenderedText === durableText`.
2. Freeze repro: turns through `nvidia/nemotron-3-ultra-550b-a55b:free` until `ResourceExhausted` → error state renders + reconcile converges.
3. Abort mid-turn (Esc) → same convergence; DB shows `finish="error"` (F1).
4. Idle 6+ min → daemon survives (P7; `daemon/activity.ts:70-79`).
5. Connections ≤ 10 throughout (F3+F4).
6. Daemon kill mid-turn → heal ≤35s (watchdog reconnect + resync, `sdk.tsx:158-238`, `sync.tsx:1023-1029`).

**DoD:** 6/6 PASS recorded in the audit doc + `TUI-2.1-SSE-STALL-REPORT.md` §6. Stall-class confidence → 100%.

---

## PHASE C — WS1 manual smoke test (master spec §8.6 quality gate, 11 phases / 50+ checkpoints)

Runbook: `docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md` (accuracy-checked). RB-01 wired → phases 2-7 and 10-11 executable. Recording per §8.6 defect classes. DoD: 11/11 recorded, zero RELEASE BLOCKERs.

| Phase | Checkpoint | Alignment |
|-------|-----------|-----------|
| 1 | Startup — clean boot, no stale branding, spine renders, prompt usable | §8.5 rules |
| 2 | Trigger approval — glyph `◤`, `approval required`, exact-hash summary, no duplicate | TUI-1.2 (§23) |
| 3 | Inspector — `v` opens, `Esc` closes to SELECTED, second `Esc` clears | TUI-1.2 |
| 4 | Full lifecycle `a` → SUBMITTING → approved → claimed → consumed | TUI-1.2 + §24 gate 1 (100%) |
| 5 | Denial — `d` → zero executor calls, DENIED receipt | §8.5 "denied visible as receipts" + §24 gate 2 (0) |
| 6 | Prompt conflict protection | §24 gate 5 (0) |
| 7 | Session isolation | §8.5 subagent isolation |
| 8 | Resize — 9 breakpoints 59/60/79/80/99/100/119/120/180 | §8.3 tiers: minimal <80 / narrow 80-99 / compact 100-119 / wide ≥120 (±5 hysteresis) + §24 gate 6 (0) |
| 9 | Theme — dark + light, status not color-alone | TUI-1.6 + §24 gate 8 (0) |
| 10 | Restart recovery — durable reconstruction, no optimistic rows | §8.1 "never invent completion truth" |
| 11 | Mouse — selection + keyboard action parity | TUI-1.5/1.6 |

---

## PHASE D — WS2 lifecycle rendering (real runtime, TUI-1.2/TUI-2 spine)

11 states: requested / running / completed / failed / denied / approval-required / approved / claimed / consumed / retried / interrupted. §8.5 rules apply: one spine entry per action, chronological, no duplicate receipts, denied ≠ success, bounded long output (RW-01 `ca73e50e`), scroll-away/return preserves state, restart reconstruction matches durable. DoD: all 11 observed, recorded in freeze report §5.

---

## PHASE E — WS3 theme / responsive / performance (TUI-1.5 + TUI-1.6)

- **WS3a theme matrix:** dark + light × 11 elements (selected, focused, pending, approved, denied, failed, successful, inspector, prompt focus, diff add, diff del) — §24 gate 8: status never color-alone. Freeze report §6.
- **WS3b width matrix:** 9 breakpoints against §8.3 tiers; checks: right-edge truncation (§8.5 rule 7, §24 gate 3 = 0), horizontal overflow, spine rail, approval visibility, inspector integrity, prompt usability, narrow-mode diff fallback (§8.3 minimal: file-only diffs). Freeze report §7.
- **WS3c performance** (thresholds DEFINED BEFORE measuring — playbook §24 + §46 latency budget):
  - frame render p95 < 16.7 ms interactive ops
  - input-to-visible-response p95 < 50 ms excl. model/network
  - session-open → first-input-ready p95 < 500 ms (warm daemon)
  - first model token p95 < 1 s excl. provider
  - 10,000-entry session scroll without unbounded memory growth (§8.5 rule: timeline virtualized, no O(N²))
  - idle CPU: no sustained
  Freeze report §8.

---

## PHASE F — WS4 security triage

dompurify 3.4.12 landed (`babd515e`, H4) — verify tree + lockfile. nitro in `packages/enterprise/enterprise` → separate `security/dependabot-remediation` PR (H5). New alerts → triage matrix per the plan v1 (package/version/patched/direct-transitive/reachability/workspace/mechanism/invocation/remediation/regression risk) + classify BLOCKS FREEZE / PATCH BEFORE MERGE / PATCH IN SEPARATE SECURITY PR.

---

## PHASE G — Freeze authorization (playbook §24 gates + §8.6)

1. WS1+WS2+WS3+H4 all pass, recorded.
2. Full automated suite rerun at final HEAD (TUI suite, typecheck 16/16, build 8/8, engine + core runners, production runner).
3. Re-point freeze report candidate SHA (`3833cde0` → final HEAD `daa37e18`+F0-F4 commits).
4. Update milestone contract: TUI-2.1 gates → PASS with evidence (JUnit + runbook + matrices).
5. `[bump]` commit at phase end (operator-approved convention); push once.
6. Tag `arcana-tui-2.1` at final HEAD.
7. Operator authorizes freeze; milestone contract → FROZEN.
8. Unblock **TUI-3 / TUI-1.3 Delegation console** (subagent console — master spec §8.4 TUI-3, playbook TUI-1.3).

---

## PHASE H — TUI-1.6 WS-P1/WS-P2 (startup perf + communication hygiene)

Source: playbook §23 TUI-1.6 (exit criteria at §23) — thresholds already defined there:
- Session-open → input-ready p95 < 500 ms; input echo p95 < 16.7 ms; redundant requests/5-min = 0; SSE reconnect ≤ 1/sec backoff+jitter; zero idle traffic.

**WS-P1 (startup/session-open):**
- P1-1 Instrument boot path: daemon spawn health poll ON the input path (`tui.ts:186-193`: 200 ms × 30) → timing marks boot→prompt, prompt→input-ready.
- P1-2 Daemon spawn/health polling async, never on input path ("TUI shell appears without blocking on engine readiness").
- P1-3 Progressive hydration — prompt accepts input before sync completes (optimistic user message exists, `routes/session/index.tsx` getParts — extend to send-before-sync).
- P1-4 Optimistic echo — typed text visible immediately (no round-trip).

**WS-P2 (communication hygiene):**
- P2-1 Request inventory audit — DONE (execution plan §7, 10 paths; verdict: no amplification; two follow-ups: boot poll P1-1, LLM retry P2-4).
- P2-2 SSE discipline — single connection, capped attempts, backoff+jitter (overlaps F4).
- P2-3 Diff-aware reads — no refetch of unchanged messages/parts (spine L2 cache).
- P2-4 Model/tool API discipline — per-session request budget, idempotency keys, **bounded retry+backoff for 429/503, never blind-retry** (currently absent by design, `map-upstream.ts:77,115` fail-closed — the recurring `ResourceExhausted` freeze trigger is the live argument; playbook: "429/503 and congestion signals are honored with backoff").
- P2-5 Idle-traffic proof — 5-min idle → zero network.
- P2-6 Regression gate — request-amplification test (one logical action → one network effect).

**DoD:** all TUI-1.6 exit criteria measured + recorded; violations fixed.

---

## PHASE I — Post-freeze backlog

1. **PEP live verification** — RB-01 landed (`90de367c` real `executeExact`, `3833cde0` wiring) but not verified in real runtime: PENDING→APPROVED→CLAIMED→CONSUMED live, denial with zero executor calls, PEP 5-min TTL (`pep.ts:328`), interruption/cancellation path (the `error=Aborted` observation). Source: `TUI-2.1-RB01-FIX-SPEC.md` §6.
2. **Snapshot-lock spam** — `failed to add snapshot files` git `index.lock` retry loop spams opencode.log every 5-20s. Find the snapshot code (search `failed to add snapshot files` in `packages/engine/src`), add backoff + surface-once.
3. **Housekeeping H1/H2/H3/H5** — untracked repro tests (`packages/tui/test/chat-shimmer-render-repro.test.tsx`, `streaming-lifecycle-repro.test.ts`): commit or delete; `.session-lock` restore or gitignore; nitro PR (H5).
4. **`.hermes/docs/ai-sdk/` untracked tree** — commit, gitignore, or move.
5. **Memory pruning** (agent memory 100%).
6. **Model/provider decision** (on hold — untouched until operator unpauses).
7. **TUI-3 / TUI-1.3 kickoff** (after freeze): delegation console — clickable subagent sessions, authority tree, child grant summaries, ancestor revocation, process isolation (master spec §8.4, playbook TUI-1.3; subagent crash isolation is a §8.5 non-negotiable rule).
8. **Playbook Phase D — Distributed Governed Autonomy** (D1-D10, §28-32): node identity/enrollment (D1), signed short-lived grants (D2), mutual auth (D3), policy distribution (D4), remote revocation (D5), distributed replay resistance (D6), proof sync (D7), cross-node proof composition (D8), partition/offline policy (D9), adversarial eval + freeze (D10). **This is the real playbook Phase D — do not confuse with the branch name.**

---

## Task assignment matrix

| Task | Assignee | Read-only? | Permission? |
|------|----------|-----------|-------------|
| PHASE A (F0-F4) | main agent (or delegated clusters) | no | YES (operator) |
| PHASE B validation | operator drives TUI; agent watches instruments | — | operator action |
| PHASE C/D/E (WS1/2/3) | operator (user) | — | — |
| PHASE F (nitro PR) | delegated implementer | no | YES |
| PHASE H (WS-P1/P2) | delegated subagents + operator verify | mixed | code YES |
| PHASE G freeze | main agent | — | operator authorization |

## Documentation support index

- Audit: `.hermes/docs/arcana/docs/tui/TUI-2.1-STALL-AUDIT-2026-08-01.md`
- This plan: `.hermes/docs/arcana/docs/tui/TUI-2.1-NEXT-STEPS.md` (v2)
- Master spec: `.hermes/docs/arcana/docs/arcana-Master/Arcana_Project_Master_Specification.md` (§8.3-8.6)
- Playbook: `.hermes/docs/arcana/docs/arcana-Master/ARCANA_PHASES_100_PERCENT_COMPLETION_PLAYBOOK.md` (§23, §24, §28-32, §46)
- OpenTUI skill: `L:\hermes\skills\opentui\SKILL.md` + `docs/opentui-reference.md` in repo + `packages/tui/node_modules/@opentui/core/` (dist 0.4.4)
