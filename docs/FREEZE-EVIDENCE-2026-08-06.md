# Arcana Freeze Evidence — 2026-08-06 (PR-7 audit convergence)

**Document class:** release-freeze evidence pack (audit convergence, LAST PR)
**Authority:** evidence — status decisions live in `docs/STATUS.md`
**Evaluated implementation commit:** `4e954e5a` — HEAD of `phase-d-implementation`
at the time this pack was produced; all commands in this document ran on that
exact tree.
**Branch:** `feat/audit-pr7-freeze-evidence` (created at `4e954e5a`)
**Host:** Windows (PowerShell), Bun 1.3.14 (`L:/DevData/.bun/bin/bun.exe`)
**Evidence pack commit:** `674fa41a` (the commit that adds this file; final
branch HEAD at push is recorded in the PR description)

Every claim below has a command + output pair. Raw logs are committed under
`docs/evidence/` and referenced per section. No number in this document is
invented; where a gate could not be executed in this environment it is marked
`NOT EXECUTED` with the reason, per the audit honesty rules.

---

## 1. Exact commit and branch ancestry

```text
$ git branch --show-current
feat/audit-pr7-freeze-evidence

$ git log --oneline -15
4e954e5a Merge pull request #87 from Lento47/feat/audit-pr3-affordances
fc18e3da Merge pull request #89 from Lento47/refactor/ci-shared-setup-action
900fd07f Merge pull request #90 from Lento47/fix/perf-scoped-binary-glob
1a5e24e9 Merge pull request #91 from Lento47/refactor/ci-exit-probe-shell-safety
f460c419 feat: runtime authority affordances per ADR-003
96911a99 refactor(ci): harden typecheck fingerprint cleanup
20258cde refactor(ci): harden exit-code probe shell handling
c97955f4 fix(perf): discover scoped engine binaries recursively
05dbfe98 fix(ci): checkout before invoking local setup action
b35b2fba fix(ci): require checkout before local setup action
791a2529 refactor(ci): reuse shared setup action
e4f31120 refactor(ci): add shared Arcana setup action
3a271c0a Merge pull request #83 from Lento47/agent/reuse-json-option-helper
f78f8bc2 Merge pull request #88 from Lento47/fix/ci-failure-isolation
64ef99a2 Merge pull request #86 from Lento47/feat/audit-pr2-exact-request
```

`git rev-parse origin/phase-d-implementation` = `4e954e5a5da2684cb315dd6d65973857cbe3307e`
— the freeze evidence is pinned to the exact phase-D implementation HEAD.

---

## 2. Test totals at the exact commit

All suites were run on the working tree at `4e954e5a` (the freeze-evidence
commit adds documentation + workflow only; it changes no code). The package
`test` scripts expand to `bun test ... --only-failures`; the canonical measure
here is the full run of the same command without `--only-failures` (observed:
after a clean full run, `bun run test` re-runs the full suite — recorded in
`docs/evidence/freeze-pr7-core-run-test-2026-08-06.log` and
`docs/evidence/freeze-pr7-tui-run-test-2026-08-06.log`).

| Package / suite | Command | Pass | Skip | Todo | Fail | Tests | Time | Exit |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Engine | `bun --cwd packages/engine test --timeout 30000` | 4369 | 74 | 1 | **3** | 4447 | 910.75s | 1 |
| Core | `bun --cwd packages/core test` | 1590 | 7 | — | **1** | 1598 | 63.81s | 1 |
| TUI | `bun --cwd packages/tui test --timeout 30000` | 819 | 1 | — | 0 | 820 | 15.16s | 0 |
| Arcana CLI/proof (supporting) | `bun test packages/arcana --timeout 30000` | 124 | — | — | 0 | 124 | 4.12s | 0 |
| TUI width/scroll/perf focus | `bun --cwd packages/tui test test/spine-prose-width.test.ts test/geometry-clamp.test.ts test/d5-prompt-width.test.ts test/approval-inspector.test.ts test/o3-clip-repro.test.tsx test/spine-layout-hysteresis.test.ts test/performance-scale.test.ts test/d10-scroll-policy.test.ts` | 59 | — | — | 0 | 59 | 1.22s | 0 |

Raw logs: `docs/evidence/freeze-pr7-engine-2026-08-06.log`,
`freeze-pr7-core-2026-08-06.log`, `freeze-pr7-tui-2026-08-06.log`,
`freeze-pr7-arcana-cli-proof-2026-08-06.log`, `freeze-pr7-tui-width-tests-2026-08-06.log`.

### Engine suite output (tail)

```text
 4369 pass
 74 skip
 1 todo
 3 fail
snapshots: 46 passed, 1 failed
 12301 expect() calls
Ran 4447 tests across 398 files. [910.75s]
error: script "test" exited with code 1
```

### Engine failures (all 3 reproduced in isolation: `freeze-pr7-engine-iso-2026-08-06.log`)

| Failure | Classification |
|---|---|
| `file HttpApi > serves search endpoints` (expected 200, received 503; `test/server/httpapi-file.test.ts:64`) | Environment/harness-class: instance returned 503 during the search request. Passed in the 2026-08-03 canonical run and the 2026-08-05 fresh run; fails deterministically in isolation on this host. Not attributable to a code change in the evaluated range. |
| `PublicApi OpenAPI v2 errors > does not rewrite /api endpoint errors to legacy error components` (`test/server/httpapi-public-openapi.test.ts:155`) | Real contract-surface drift at this commit: PR #87 (`feat/audit-pr3-affordances`, HEAD) mounted `/api/session/{sessionID}/approval/{approvalID}/affordances` with a `404 NotFoundError` in the public v2 spec. The guard test expects no legacy error components under `/api`. |
| `opencode CLI help-text snapshots > every documented command emits stable help text` (`test/cli/help/help-snapshots.test.ts:130`) | Real stale snapshot at this commit: `arcana session list` gained `--json` (default false) after the snapshot was recorded. 46 snapshots passed, 1 failed. |

The two real failures are both introduced by the most recent merged PRs and
are surfaced here as release blockers to fix forward; neither weakens the
authorization invariants exercised by the smoke plan below.

### Core suite output (tail) + failure

```text
 1590 pass
 7 skip
 1 fail
Ran 1598 tests across 184 files. [63.81s]
```

Failure: `cross-spawn spawner > combined output (all) > captures stdout via
.all when no stderr` (`packages/core/test/effect/cross-spawn-spawner.test.ts:199`)
— expects `"hello from stdout"` (quoted) for `echo` on win32, received the
unquoted string. Reproduced in isolation (`freeze-pr7-core-iso-2026-08-06.log`).
Host-specific Windows shell quoting variance; matches the environment-class
failures documented in `docs/STATUS.md` for prior fresh runs.

### TUI suite output (tail)

```text
 819 pass
 1 skip
 0 fail
 8 snapshots, 2464 expect() calls
Ran 820 tests across 111 files. [15.16s]
```

---

## 3. Typechecks per package (all clean)

| Package | Command | Exit | Time |
|---|---|---:|---:|
| Engine | `bun run typecheck` (cwd `packages/engine`) | 0 | 11.8s |
| Core | `bun run typecheck` (cwd `packages/core`) | 0 | 3.3s |
| TUI | `bun run typecheck` (cwd `packages/tui`) | 0 | 1.4s |
| Enterprise | `bun run typecheck` (cwd `packages/enterprise`) | 0 | 1.4s |

Logs: `docs/evidence/freeze-pr7-typecheck-{engine,core,tui,enterprise}-2026-08-06.log`.
The engine typecheck includes the new smoke script
(`packages/engine/script/audit-pr7-freeze-smoke.ts`), so its exit 0 covers the
evidence tooling itself.

---

## 4. 11-phase smoke plan (headless, at the exact commit)

Command:

```text
$ bun --cwd packages/engine script/audit-pr7-freeze-smoke.ts
```

Raw log: `docs/evidence/freeze-pr7-smoke-2026-08-06.log`. The script isolates
all XDG state and `ARCANA_DB` in a temp root and uses scoped tmpdir workspaces
that are deleted on exit; it never touches real user data.

| # | Phase | Result | Evidence (log excerpt) |
|---|---|---|---|
| 1 | Runtime boots clean | **PASS** | `runtime app constructed; first request round-trip HTTP 200` |
| 2 | Session create/list | **PASS** | `session ses_... created and listed via /sessions (HTTP 200)` |
| 3 | Approval request created with snapshot | **PASS** | `approval appr_pr7_journey_001 PENDING; requestHash d6b979872d744ffb...; ledger at .arcana/approvals.db` |
| 4 | Inspector shows EXACT request (action/resource/arguments/capability/policy) | **PASS** | `snapshot verified; action=filesystem.write resource=kind=file path=...\notes.txt arguments=["write","notes.txt","governed content"] capability=approval-cap-appr_pr7_journey_001 policy=phase-c-v1 risk=HIGH` |
| 5 | Approve via runtime command | **PASS** | `state=APPROVED operator=local-operator reason=none` |
| 6 | Effect executes at most once | **PASS** | `duplicate approve refused=true (approval is APPROVED, not actionable); claim=CLAIMED bound=exec_pr7_001; replay claim refused=true (approval is CLAIMED, not APPROVED); consume=CONSUMED` |
| 7 | Proof receipt produced | **PASS** | `proof-manager RunProof completed with 6 events; engine /proofs projection HTTP 200 proofLevel=P0 integrity=UNVERIFIED hash=1babbb413e09b927...` (see note) |
| 8 | Restart recovery (approval + ledger survive restart) | **PASS** | `after instance dispose+reload: record state=APPROVED; HTTP /approvals contains it=true` |
| 9 | Session isolation (two sessions never see each other's approvals) | **PASS** | `session B (ses_...) and approval B (appr_pr7_journey_002) invisible from workspace A` |
| 10 | Verify evidence via RunProof | **PASS** | `verifier valid=true (...); tampered events rejected=true (event 1 timestamp out of order); fingerprint stable=true` |
| 11 | TUI width matrix 59/100/120+ renders without truncation corruption | **NOT EXECUTED (interactive)** | See §5; automated width-contract proxy passes 59/59 |

Summary line: `PASS 10 / 10; FAIL 0` (headless phases 1–10), exit 0.

**Phase 7 honesty note:** the P3-class receipt is produced through the same
proof-manager that backs `arcana run --proof` (`packages/arcana/src/proof/`):
plan → approval-required → executed → verification passed → completed, with a
committed `RunProof` and verification evidence. The engine `/proofs/:sessionID`
projection for a fresh session (no governance events yet) legitimately reports
`proofLevel=P0 / integrity=UNVERIFIED`; a P3 engine projection requires a full
agent run with a completion contract, which is covered by the engine suite's
live-governance tests (e.g. `test/server/httpapi-listen.test.ts`, passing) and
is outside this headless slice. The distinction is stated, not blurred.

---

## 5. Width render matrix 59–180

Interactive rendering in a real Windows Terminal at each width requires an
operator session and a display. This audit environment has no interactive
terminal, so every interactive cell is `NOT EXECUTED` with that reason. The
automated geometry/width contract tests that guard the same corruption modes
(right-edge clipping, prompt width, rail/prose budgets, inspector
untruncated hashes, layout hysteresis) all pass (59/59, §2), including the
matrix anchor widths 59/60, 79/80, 99/100, 119/120, and 160 as proxies for
180.

| Width | Right-edge clipping | Rail/prompt | Approval row | Inspector | Status |
|---:|---|---|---|---|---|
| 59 | automated contract PASS (60-col budget) | automated PASS (prompt max-width clamp) | automated PASS (prose/geometry) | automated PASS (untruncated fields) | PASS (automated); interactive NOT EXECUTED — no terminal |
| 60 | automated contract PASS | automated PASS | automated PASS | automated PASS | PASS (automated); interactive NOT EXECUTED — no terminal |
| 79 | automated contract PASS (80-col budget) | automated PASS | automated PASS | automated PASS | PASS (automated); interactive NOT EXECUTED — no terminal |
| 80 | automated contract PASS | automated PASS | automated PASS | automated PASS | PASS (automated); interactive NOT EXECUTED — no terminal |
| 99 | automated contract PASS (100-col budget) | automated PASS | automated PASS | automated PASS | PASS (automated); interactive NOT EXECUTED — no terminal |
| 100 | automated contract PASS | automated PASS | automated PASS | automated PASS | PASS (automated); interactive NOT EXECUTED — no terminal |
| 119 | automated contract PASS (120-col budget) | automated PASS | automated PASS | automated PASS | PASS (automated); interactive NOT EXECUTED — no terminal |
| 120 | automated contract PASS | automated PASS | automated PASS | automated PASS | PASS (automated); interactive NOT EXECUTED — no terminal |
| 180 | automated contract PASS (160-col budget; `spineProseWidth(160)` scaled) | automated PASS | automated PASS | automated PASS | PASS (automated); interactive NOT EXECUTED — no terminal |

Automated guard tests: `spine-prose-width.test.ts` (budgets at 10–160),
`geometry-clamp.test.ts` (diff pane / prompt width at 30–200),
`d5-prompt-width.test.ts` (prompt max-height), `approval-inspector.test.ts`
(full hash/lifecycle fields never truncated), `o3-clip-repro.test.tsx`
(right-edge clip regression), `spine-layout-hysteresis.test.ts`
(no reflow thrash), `performance-scale.test.ts`, `d10-scroll-policy.test.ts`.

---

## 6. Dark + light theme smoke check

**NOT EXECUTED (interactive).** A theme matrix requires rendering the real TUI
in dark and light and visually checking approval/tool/spine states
(runbook Gate 3; `BLK-TUI-03`). No interactive terminal is available in this
audit environment. The automated TUI suite (819 pass / 1 skip / 0 fail at this
commit) includes theme-structure contracts (theme schema, brand-rebound,
focus-highlight contrast) and remains green; the human theme matrix stays an
open release gate.

---

## 7. Input / scroll / memory / reconnect measurements

**NOT MEASURED (interactive latency targets).** The runbook Gate 8 targets
(p95 input echo < 16.7 ms, session-open to input-ready < 500 ms, idle CPU,
scroll stalls, memory growth, reconnect storms) require a live terminal
operator session with keystroke timing, which is not available headlessly.
Automated proxies at this commit all pass: scroll policy
(`d10-scroll-policy.test.ts`), performance scale
(`performance-scale.test.ts`), layout hysteresis
(`spine-layout-hysteresis.test.ts`), reconnect/reconcile convergence
(`app-lifecycle.test.tsx` + sync tests inside the TUI suite), and daemon
respawn (`daemon-respawn.test.ts`). The 59-test focused run (§2) and the full
TUI suite both exit 0.

---

## 8. Reproducibility appendix

| Claim | Command | Log |
|---|---|---|
| Engine suite totals | `bun --cwd packages/engine test --timeout 30000` | `docs/evidence/freeze-pr7-engine-2026-08-06.log` |
| Engine failure repro | `bun --cwd packages/engine test test/server/httpapi-file.test.ts test/server/httpapi-public-openapi.test.ts test/cli/help/help-snapshots.test.ts --timeout 30000` | `docs/evidence/freeze-pr7-engine-iso-2026-08-06.log` |
| Core suite totals | `bun --cwd packages/core test` | `docs/evidence/freeze-pr7-core-2026-08-06.log` |
| Core failure repro | `bun --cwd packages/core test test/effect/cross-spawn-spawner.test.ts --timeout 30000` | `docs/evidence/freeze-pr7-core-iso-2026-08-06.log` |
| TUI suite totals | `bun --cwd packages/tui test --timeout 30000` | `docs/evidence/freeze-pr7-tui-2026-08-06.log` |
| TUI width/scroll/perf focus | `bun --cwd packages/tui test <8 files>` | `docs/evidence/freeze-pr7-tui-width-tests-2026-08-06.log` |
| Arcana CLI/proof suite | `bun test packages/arcana --timeout 30000` | `docs/evidence/freeze-pr7-arcana-cli-proof-2026-08-06.log` |
| Typechecks ×4 | `bun run typecheck` per package | `docs/evidence/freeze-pr7-typecheck-*-2026-08-06.log` |
| 11-phase smoke | `bun --cwd packages/engine script/audit-pr7-freeze-smoke.ts` | `docs/evidence/freeze-pr7-smoke-2026-08-06.log` |

## 9. Non-claims

- No interactive TUI gates (width matrix at a live terminal, theme matrix,
  keystroke latency) are claimed as executed; they are marked NOT EXECUTED with
  reason and remain open freeze gates (`BLK-TUI-02/03/07`).
- No engine P3 projection is claimed from the headless slice; the proof
  receipt is the proof-manager verified-completion path, and the engine
  `/proofs` projection is reported as measured (P0/UNVERIFIED for a fresh
  session).
- The 4 failing tests (3 engine, 1 core) are real, reproduced, and classified
  above; none is hidden or re-run into green.
- This pack is evidence, not a freeze authorization. Human sign-off per
  `docs/FREEZE-RELEASE.md` Gate 9 remains required.
