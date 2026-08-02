# TUI-2.1 Freeze Sign-off — 2026-08-01

**Status: NOT AUTHORIZED — freeze pending. Do not tag any current candidate.**

## 1. Scope

TUI-2.1 production integration and polish of the frozen TUI-2 milestone: the
command-spine approval pipeline (adapter, controller, integration hook, engine
command endpoint, SSE push, restart recovery).

Current implementation state (`phase-d-implementation` @ `c07faba6`):

- Approval pipeline mounted end-to-end; freeze candidate `3833cde0` pushed.
- Later fixes in the branch: `ca73e50e` (RW-01 reasoning wrap), `d05ecfff`
  (PENDING-create SSE push), `c07faba6` (complete streamed message render).
- Older candidates (`3833cde0`, `e7cc8da6`, `1ed93b12`) are historical and must
  NOT become the final TUI-2.1 tag target.

## 2. Required gates (all must be satisfied before sign-off)

Operator instructions for every gate, with exact commands, matrices, and
performance thresholds: `docs/tui/TUI-2.1-FREEZE-OPERATOR-RUNBOOK.md`.

- [ ] Manual Windows Terminal smoke test — 11-phase WS1 checklist
      (`docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md`)
- [ ] Width matrix — 59/60/79/80/99/100/119/120/180 (right-edge clipping, rail,
      prompt, approval, inspector)
- [ ] Dark/light theme matrix — all approval/tool/spine states; security states
      never rely on color alone
- [ ] Approval lifecycle observation — PENDING → APPROVED → CLAIMED → CONSUMED;
      denial executes zero effects
- [ ] Restart recovery — durable approvals re-hydrate after restart
- [ ] Session isolation — approvals and state scoped per session
- [ ] Performance measurements — typing lag, idle CPU, scroll stalls, viewport
      culling, memory growth
- [ ] Zero release/polish blockers
- [ ] Full automated verification rerun at the exact final commit: 16/16
      typecheck, 8/8 builds, full engine/core/TUI suites, Rust conformance

### Stream live-validation protocol (from `docs/audits/stream-truncation-audit.md`)

The eight stream fixes are implemented and typechecked; disease-class
confidence is ~92% before live validation. Fold these six checkpoints into the
freeze (probe: `bun run /l/tmp/probe-sse.ts http://127.0.0.1:9142`):

- [ ] 1. Live rendered text equals durable text
- [ ] 2. ResourceExhausted/error turn renders visibly and reconciles
- [ ] 3. Abort mid-turn persists `finish="error"`
- [ ] 4. Daemon survives 6+ minutes idle
- [ ] 5. Active connections remain ≤ 10 throughout
- [ ] 6. Daemon kill mid-turn heals within ~35 seconds

DoD: 6/6 PASS → stall-class confidence 100%.

## 2.1 Checkpoint evidence (2026-08-02 — automated side)

Green at the current worktree (not yet the final commit):

| Gate | Result |
|---|---|
| TUI suite | 781 pass / 1 skip / 0 fail (782 tests) |
| Core suite | 1256 pass / 7 skip / 0 fail (clean rerun) |
| Arcana CLI | 116 / 0 |
| SDK | 7 / 0 |
| Rust conformance | 2 / 2 |
| Typecheck | 16/16 packages |
| Build | 8/8 |
| Smoke | 8/8 · ML eval 13/13 |
| Engine | CLEAN full run 2026-08-02: 4248 pass / 74 skip / 1 todo / 0 fail (4,323 tests, 1,044s); both prior flake classes fixed and verified |

Remaining before sign-off is exactly §2 (manual/live validation) plus the
exact-commit rerun of every suite.

### Manual validation progress (2026-08-02)

Observed by the operator in a live Windows Terminal session:

- [x] TUI opens and stays running (dev + compiled binary) after the OpenTUI
      0.4.5 patch (F-15) and daemon seed fix (F-16)
- [x] Startup + home screen render
- [x] Contract admission via the action gate (Allow once) — contract
      proposed → accepted → activated → obligation created
- [x] Assistant reply renders in the chat card
- [x] Governance aggregation — 25+ events collapsed into one `governed` row
- [x] RunProof axes — degraded → complete transition across contracts;
      overall assurance vs recorded/authorization trace separation observed
- [x] Tool execution (`read`, `pwd`) with authorization evidence
- [x] Approval via the action gate (Allow once) for `pwd`
- [x] Per-contract verified completion — second contract resolved to
      `P3 · complete · VERIFIED` (completion-gate idempotency fix, F-18)
- [x] Operator denial → zero protected effects — confirmed twice: rejected a
      `cargo` gate, and denied a `write` to `L:\tmp\PS5\smoke-test2.txt`
      (`authorization.execution_failed` / PermissionRejectedError, no
      `authorization.executed`, file not created) while the allowed write to
      `smoke-test.txt` executed with content `arcana`
- [x] Restart durability — session, contract, and proof state persisted
      across a TUI restart
- [x] Criteria-specific completion blocking observed ("Relevant tests and
      checks pass" stayed pending without a `test_receipt`); production
      receipt emission added (F-19), re-validation with a fresh test run
      pending
- [x] Execution-failure visibility (F-20) and proof/governed ordering
      stability (F-21) — fixed and confirmed by the operator

Still required: durable approval lifecycle via spine keys (`v`/`a`/`d`,
PENDING → APPROVED → CLAIMED → CONSUMED), inspector, prompt-conflict, session
isolation, resize/width matrix, theme matrix, live-stream protocol,
performance, and the exact-commit rerun.

Still required: durable approval lifecycle via spine keys (`v`/`a`/`d`,
PENDING → APPROVED → CLAIMED → CONSUMED), denial with zero executor calls,
inspector, prompt-conflict, session isolation, resize/width matrix, theme
matrix, restart recovery, live-stream protocol, and performance.

## 3. Tag target

TBD — the exact commit tested after all presentation polish, manual matrices,
performance checks, documentation corrections, and final full-suite
verification. Do not tag an earlier candidate.

## 4. Sign-off record

| Role | Name | Decision | Date | Signature |
|------|------|----------|------|-----------|
| Approver | | ☐ Approve / ☐ Reject | | |

Exceptions / follow-ups:

---

Prepared review artifact — does not itself constitute approval.
