# Campaign Boundary — Eight-State Checkpoint Record (historical)

**Document class:** historical checkpoint record
**Authority:** HISTORICAL — the current-status authority is `docs/STATUS.md`.
This file records what was true at implementation checkpoint `0392ad7b` and
is **not** the current status source.
**Implementation checkpoint:** `0392ad7b` (2026-08-02; suites verified on the
pre-commit worktree, which the commit reproduces exactly)
**Documentation reconciliation commit:** `882ea468` (baseline for the
consolidated files)
**Created:** 2026-08-02

## Purpose

Records the boundary state of every campaign capability at checkpoint
`0392ad7b` on one state axis, so that later claims ("implemented",
"production-mounted", "automated-validated", "live-validated",
"independently-validated", "frozen", "released") cannot be confused with one
another. A capability's state is the highest state for which evidence
exists; no state above the evidence line is claimed.

## State axis (eight states)

| # | State | Meaning |
|---|---|---|
| 1 | PLANNED | Scoped but not implemented |
| 2 | IMPLEMENTED | Code exists and is unit/integration tested in-repo |
| 3 | PRODUCTION-MOUNTED | Reachable through the production path (CLI / TUI / HTTP / SDK) |
| 4 | AUTOMATED-VALIDATED | Covered by automated suites at the checkpoint commit |
| 5 | LIVE-VALIDATED | Exercised on a live operator-run environment |
| 6 | INDEPENDENTLY-VALIDATED | Reproduced by a separate party or independent implementation |
| 7 | FROZEN | Milestone tagged and human-approved |
| 8 | RELEASED | Shipped through the release flow with signed artifacts |

## Capability boundary at 0392ad7b

| Capability | State at checkpoint | Notes / remaining |
|---|---|---|
| Phase A — Epistemic Foundation | FROZEN | Declared complete in the master spec; tags in branch ancestry |
| Phase B — Verification and Replay | FROZEN | Milestone tag `arcana-epistemic-runtime-phase-b` |
| Phase C — Local Governed Autonomy | AUTOMATED-VALIDATED (approved with exceptions; tags exist) | 95-fixture adversarial evaluation, 0 unexpected allows; L3 independent reproduction pending (AUD-20) |
| TUI-2 — Interactive Authority Control | FROZEN | Tag `arcana-tui-2-interactive-authority-control` |
| TUI-2.1 — Production Integration + Polish | AUTOMATED-VALIDATED (786 pass / 1 skip / 0 fail) | Manual/live freeze gates pending; freeze NOT authorized (BLK-TUI-01..08) |
| CLI 1.0 contract | PLANNED (freeze draft only) | BLK-CLI-01..05; no frozen JSON/exit-code contract; shell completion and cross-platform matrix pending |
| External CLI adapters (codex/claude/gemini) | IMPLEMENTED (A1 launch scaffold) | Declaration, dry-run, supervision, durable evidence; no sandbox claim; production-certified adapter: no (BLK-CLI-01) |
| Phase D — Distributed Governed Autonomy | IMPLEMENTED → PRODUCTION-MOUNTED (partial) | Implementation coverage HIGH; release readiness BLOCKED (TLS/mTLS, live Linux, offline PEP wiring, Node 1.0 freeze, L3) |
| Phase E — Protocol / SDK / Adapters | IMPLEMENTED + AUTOMATED-VALIDATED (conformance 5/5) | Implementation MODERATE–HIGH; release BLOCKED (live PEP transport, macOS/Linux, L3, ecosystem freeze) |
| Phase F — Enterprise service cores (F1–F13) | IMPLEMENTED + PRODUCTION-MOUNTED (substantial) | Service cores HIGH; mounting SUBSTANTIAL; release BLOCKED |
| Enterprise authenticated administrative identity | PLANNED / BLOCKED (P0) | BLK-F-AUTH-01 — mutations must derive actor/tenant identity from authenticated server context; body actor fields must not establish authority or audit attribution |
| Arcana 1.0 convergence | PLANNED | NOT REACHED; release flow not executed (BLK-1.0-01..05) |

## Verification evidence at 0392ad7b

```text
Implementation checkpoint: 0392ad7b
Engine: 4305 pass / 4 fail / 1 todo
Timeout: default 5 seconds
Classification: not a clean suite
Closure: clean full rerun under the approved timeout policy
```

| Suite | Result |
|---|---|
| TUI | 786 pass / 1 skip / 0 fail (787 tests) |
| Core | 1465 pass / 7 skip / 0 fail (1472 tests, 175 files) |
| Arcana CLI/proof | 116 pass / 0 fail |
| SDK JS | 34 pass / 0 fail (full `src` run) |
| Conformance runner | 5/5 suites (46 crypto + 4 adapter vectors + 15 hostile fixtures + Rust verifier + SDK surface) |
| Typecheck | 16/16 packages |
| Build | 8/8 tasks |

## Nonclaims

- This record is historical; `docs/STATUS.md` is the live authority.
- No state above AUTOMATED-VALIDATED is claimed for Phase D/E/F work except
  where explicitly noted (Phase A/B/C and TUI-2 tags are FROZEN; nothing is
  RELEASED).
- FROZEN and RELEASED are never self-certified; they require explicit human
  sign-off and, for RELEASED, signed artifacts through the release flow.
