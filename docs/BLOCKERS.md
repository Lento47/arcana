# Arcana Blocker Register (consolidated)

**Document class:** blocker register (evidence-backed)
**Authority:** secondary — status decisions live in `docs/STATUS.md`
**Created:** 2026-08-02 (Phase A–F completion audit)
**Consolidated:** 2026-08-02 — single register replacing the former `docs/blockers/` folder
**Implementation checkpoint:** `fb7c1968` (2026-08-21; last code checkpoint before the 2026-08-22 documentation reconciliation)
**Documentation reconciliation commit:** `d21c5e3e` (2026-08-22)

This file consolidates every phase and product-track blocker register. Each area below preserves the original rows: the playbook task or gate it blocks, the current evidence of the gap, and the acceptance evidence required to close it.

## Methodology

Gate vocabulary follows playbook §4.2 (`PASS | FAIL | BLOCKED | DEGRADED |
NOT APPLICABLE`). A task is never marked complete from unit tests alone; it
must be production-mounted, adversarially tested, restart-safe, measured,
observable, documented, and (for frozen milestones) human-approved.

Blocker IDs use the form:

```text
BLK-<AREA>-<NN>
```

where `<AREA>` is `A`, `B`, `C`, `TUI`, `CLI`, `D`, `E`, `F`, or `1.0`.

Each blocker row states:

1. The playbook task or gate it blocks.
2. The current evidence of the gap (files, commands, observed behavior).
3. Why it blocks the 100% declaration.
4. The acceptance evidence required to close it.

## Summary

| Area | Current status | Open blockers | Source section |
|---|---|---:|---|
| Phase A — Epistemic Foundation | COMPLETE / FROZEN | 0 | [§Phase A](#phase-a--epistemic-foundation) |
| Phase B — Verification & Replay | COMPLETE / FROZEN | 0 | [§Phase B](#phase-b--verification-and-replay) |
| Phase C — Local Governed Autonomy | EVALUATION PASS, signed with exceptions | 0 (scope-limited) | [§Phase C](#phase-c--local-governed-autonomy) |
| Goal verification + reserved memory boundary | COMMITTED (5bb8d9e8); focused tests 63/0; full TUI suite green (1229/0) | 0 | [§Goal verification](#goal-verification-and-memory-boundary) |
| TUI 1.0 (TUI-2.1 freeze) | MOUNTED; suite green (1229/0 across 161 files, coordinator-verified at base `680ab7a1` — the lexicon fix landed on the line in `680ab7a1`, making PR #147 redundant; the 42-failure figure is the stale 2026-08-22 working-tree snapshot, superseded by BLK-GOAL-03 closure); freeze NOT authorized | 8 | [§TUI 1.0 / TUI-2.1](#tui-10--tui-21) |
| Goal Verification & Memory Boundary | COMMITTED (5bb8d9e8); focused tests 63/0; full suite green (1229/0) | 0 | [§Goal Verification](#goal-verification-and-memory-boundary) |
| CLI 1.0 | PARTIAL — no frozen contract | 5 | [§CLI 1.0](#cli-10) |
| Phase D — Distributed Governed Autonomy | Implementation coverage: HIGH; release readiness: BLOCKED | 9 | [§Phase D](#phase-d--distributed-governed-autonomy) |
| Phase E — Protocol, SDKs, Adapters | PARTIAL — conformance 5/5 + adapters + certified vectors; freeze pending live/L3 | 10 | [§Phase E](#phase-e--protocol-sdks-adapters) |
| Phase F — Enterprise Control Plane | Service cores: HIGH; mounting: SUBSTANTIAL; auth boundary: RESOLVED (PR #53); release: BLOCKED | 14 | [§Phase F](#phase-f--enterprise-control-plane) |
| Arcana 1.0 convergence | NOT reached | 5 | [§Arcana 1.0](#arcana-10-convergence) |

### 2026-08-22 reconciliation note

The current `arcanagov` checkpoint is `fb7c1968`, 161 commits after the prior
`f3c935e6` status checkpoint. The Aug. 15–21 wave materially advances
governance persistence, permission scoping, prompt delivery, TUI/voice,
subagents, file-edit guards, A1 runtime launch coverage, custom providers, and
enterprise console routes. It does not close the release gates below.

Fresh working-tree verification on Windows under pinned Bun 1.3.14 reports TUI
1,132 pass / 42 fail / 1 skip; Bun 1.4.0 independently reproduced the same 42
failures. Focused engine checks report 225 pass / 4 fail / 18 skip; focused
core/memory checks report 71 pass with one teardown-hook failure; TUI and engine
typechecks pass. An exact-commit green suite is an explicit prerequisite for
BLK-TUI-08. Uncommitted goal-verification,
reserved-memory, and session-navigation work is tracked as working-tree evidence
only until committed.


## Phase A — Epistemic Foundation

**Status: COMPLETE / FROZEN** (declared complete in the master spec and
`docs/STATUS.md`; historical tag lineage is preserved in `arcanagov`).

## Open blockers

**None.**

## Gate audit (playbook §8)

| Gate | Required | Evidence | Verdict |
|---|---|---|---|
| Event-chain integrity violations undetected | 0 | `event-hash.test.ts`, `event-store-concurrency.test.ts`, `event-store-multi-connection.test.ts`, `failure-injection.test.ts` (engine suite) | PASS |
| Verified completions with unmet obligations | 0 | `completion-verifier.test.ts`, `obligation-engine.ts`, `completion-gate-idempotency.test.ts` | PASS |
| Evidence references to missing artifacts | 0 | claim/evidence store tests; receipt-kind tests (`packages/core/test/capability/receipt-kind.test.ts`) | PASS |
| Duplicate event sequences | 0 | transactional sequence tests in event-store suites | PASS |
| Phase A production-source type errors | 0 | repo-wide typecheck 16/16 (2026-08-02) | PASS |
| Deterministic completion disagreements | 0 | deterministic-replay + completion determinism tests | PASS |
| Schema migration tests | 100% | SQLite migration suite (`packages/core/src/database/migration*`) | PASS |
| Restart reconstruction tests | 100% | `run-proof-restart.test.ts`, `intent-binding-store-persistence.test.ts`, `capability-revocation-sqlite.test.ts` | PASS |

## Task completion evidence (playbook §7)

| Task | Weight | Evidence |
|---|---:|---|
| A1 Typed claim/evidence schemas | 10% | claim/evidence stores in `packages/engine/src/session/epistemic/claim-store.ts`; schema tests | 
| A2 Contracts, criteria, obligations, revisions | 15% | `contract-engine.ts`, `obligation-engine.ts`, `contract-admission.ts`, `contract-admission.test.ts` |
| A3 Append-only hash-linked event store | 20% | `event-store.ts` + concurrency/mutation/failure suites |
| A4 Execution receipts and artifacts | 15% | PEP receipts (`test_receipt`/`build_receipt`, F-19), receipt-kind tests |
| A5 Hard completion gate | 20% | `completion-verifier.ts` + idempotency tests |
| A6 Inspection commands | 10% | `arcana epistemic proof inspect/verify/export`, `replay audit/deterministic` |
| A7 Test/benchmark/document/freeze | 10% | `PHASE-B-MILESTONE.md`, phase baselines, this register |

## Historical blockers (closed)

| Blocker | Closure evidence |
|---|---|
| Completion gate idempotency was per-session, not per-contract | F-18 fix + `completion-gate-idempotency.test.ts` |
| Criteria receipts never emitted in production | F-19 fix + production receipt tests |

## Nonclaims preserved

Phase A does not prove authorization, host integrity, external truth, model
honesty, or cross-machine reproducibility of the environment.

## Phase B — Verification and Replay

**Status: COMPLETE / FROZEN** (`arcana-epistemic-runtime-phase-b` tag).

## Open blockers

**None.**

## Gate audit (playbook §14)

| Gate | Required | Evidence | Verdict |
|---|---|---|---|
| Invalid event chains accepted | 0 | `event-hash.test.ts`, `run-proof.test.ts` | PASS |
| Historical proofs mutated by revalidation | 0 | `live-revalidation.test.ts` immutability cases | PASS |
| False FULL reproducibility classifications | 0 | `deterministic-replay.test.ts`, `replay-matrix.test.ts` | PASS |
| False COMPLETE trace profiles | 0 | trace-health semantics in `run-proof.ts` + suites | PASS |
| Audit/live reconstruction disagreements | 0 | `audit-replay.test.ts`, `live-revalidation.test.ts` | PASS |
| Phase A regressions | 0 | combined engine/core reruns (2026-08-02) | PASS |
| Proof export/verify fixtures | 100% | `run-proof-export.test.ts`, `run-proof-performance.test.ts` | PASS |
| Replay drift-detection fixtures | 100% | `replay-fixture.test.ts`, `replay-matrix.test.ts` | PASS |

## Task completion evidence (playbook §13)

| Task | Weight | Evidence |
|---|---:|---|
| B1 RunProof schema | 15% | `packages/arcana/src/proof/types.ts`, `run-proof.ts` |
| B2 Proof generation and verification | 15% | `proof-manager.ts`, `proof-runtime.ts` + tests |
| B3 Audit replay | 15% | `audit-replay.ts` + tests |
| B4 Deterministic replay | 20% | `deterministic-replay.ts` + fixture matrix |
| B5 Live revalidation | 10% | `live-revalidation.ts` + tests |
| B6 Trace health | 10% | RunProof trace axes + degraded-evidence tests |
| B7 Performance and scalability | 5% | `run-proof-performance.test.ts` (derive p50 2.89–5.40 ms) |
| B8 Documentation and freeze | 10% | `PHASE-B-MILESTONE.md`, protocol registry |

## Performance note

Measured at the 2026-08-01/02 checkpoint: RunProof derivation p50 2.89–5.40 ms
over the evaluated event volume; audit replay derivation < 500 ms. Re-measure
at the exact final commit for the full Phase B freeze claim.

## Nonclaims preserved

Proof verification is model-independent; it does not assert semantic truth of
external facts or environment reproducibility on other hosts.

## Phase C — Local Governed Autonomy

**Status: EVALUATION PASS — 95 adversarial fixtures, 0 unexpected allows,
0 protected executor calls on denied paths. Release sign-off: APPROVED WITH
EXCEPTIONS (2026-08-01). Tags: `arcana-governed-autonomy-phase-c`,
`phase-c-production-enforcement`.**

## Open blockers

**None within the declared Phase C scope.** The following are explicitly NOT
Phase C blockers (recorded as nonclaims or later-phase work):

- L3+ independent reproduction of the evaluation (global validation-level
  gap, not a Phase C gate).
- Physical host containment (namespaces/seccomp/job objects) — tracked in
  Phase D (D-7.1).
- Governance of external CLIs and processes outside the Arcana effect
  boundary — Phase E.

## Gate audit (playbook §19)

| Gate | Required | Evidence | Verdict |
|---|---|---|---|
| Unexpected allows | 0 | 95-fixture suite (wave 1–5), re-verified green | PASS |
| Protected executor calls on denied paths | 0 | PEP spy suites (`production-enforcement.test.ts`, `pep.test.ts`) | PASS |
| Capability amplifications | 0 | `delegation.test.ts`, `delegation-hardening.test.ts`, `runtime-delegation.test.ts` | PASS |
| Approval replay executions | 0 | `scoped-approval.test.ts`, `pep-use-claim.test.ts`, `atomic-use-replay.test.ts` | PASS |
| Revoked-ancestor executions | 0 | cascade revocation suites (unit + SQLite + HTTP) | PASS |
| Secret-exfiltration successes | 0 | `information-flow.test.ts`, `field-lineage.test.ts` | PASS |
| Unlabeled consequential executions | 0 | provenance/label suites | PASS |
| Known model-facing P0 bypasses | 0 | adversarial waves + gap-closure suite | PASS |
| Benign workflow success | 100% of frozen suite | 14/14 benign workflows; engine/core/TUI reruns | PASS |
| Capability/security tests | 100% | capability suites above | PASS |
| Phase A/B regressions | 0 | combined reruns (2026-08-02) | PASS |
| Production-source type errors | 0 | typecheck 16/16 | PASS |

## Task completion evidence (playbook §18)

| Task | Weight | Evidence |
|---|---:|---|
| C1 Canonical authorization requests | 5% | `request-hash.ts`, `canonical-resource.ts`, PEP integration |
| C2 Durable capability grants | 10% | `grant-store-sqlite.ts`, `grant-store.ts`, `session-grants.ts` + suites |
| C3 Pure PDP | 10% | `pdp.ts` + deterministic snapshot tests |
| C4 Effect-boundary PEP | 10% | `pep.ts`, `pep-integration.ts`, `effect-boundary.ts` + spy suites |
| C5 Intent-action binding | 8% | `intent-binding*.ts`, `intent-runtime.ts` + suites |
| C6 Provenance and sensitivity | 8% | `labels.ts`, `field-lineage.ts`, `information-flow.test.ts` |
| C7 Scoped approvals | 8% | `scoped-approval.ts` + lifecycle suites |
| C8 Delegated least privilege | 8% | `delegation.ts`, `runtime-delegation.ts`, `child-launch-barrier.ts` + suites |
| C9 Workspace and MCP trust | 6% | `trust-adapters.ts` + suites |
| C10 Security evidence / RunProof profiles | 5% | RunProof profiles + trace health suites |
| C11 Adversarial evaluation | 12% | 95 fixtures, 8 groups (playbook §18.1) |
| C12 Freeze and tag | 10% | PHASE-C-MILESTONE, tags, sign-off |

## Accepted exceptions (2026-08-01 sign-off)

1. Mainline (`master`) promotion is a post-sign-off release action.
2. Bun 1.3.14 root-runner segfault is isolated through package-local runners.
3. TUI-2.1 and unfinished Phase D are outside this sign-off.
4. The TUI-2 tag certifies its historical milestone contract only.

## Nonclaims preserved

No universal prompt-injection prevention, no hostile-host containment, no
governance of out-of-boundary processes, no distributed-node security, no
remote attestation.

## TUI 1.0 / TUI-2.1

**Status: TUI-2 FROZEN (`arcana-tui-2-interactive-authority-control`);
TUI-2.1 MOUNTED, current working-tree regressions OPEN, freeze NOT AUTHORIZED.**

The open blockers below are exactly the TUI-2.1 freeze gates
(TUI-2.1-FREEZE-OPERATOR-RUNBOOK) plus the remaining product-track
items (TUI-3 delegation console, TUI-4 proof/replay/audit views, TUI-5
final polish) that are outside the TUI-2.1 scope. The 2026-08-03 upstream
advance to `63d71f07` (merged PRs #43–47: ci base green, ci split
verification gates, ml-eval script routing, enterprise tailwind import fix,
shared governance projection contract docs) closed no TUI-2.1 freeze blocker;
all eight (`BLK-TUI-01..08`) remain open.

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
| BLK-TUI-08 | Runbook Gate 9/10 — exact-commit rerun + zero blockers | 2026-08-22 pinned Bun 1.3.14 working-tree run: TUI 1,132 pass / 42 fail / 1 skip; Bun 1.4.0 also reports 42 failures. Focused engine: 225 pass / 4 fail / 18 skip; focused core/memory has one teardown-hook failure. The worktree is not a committed final candidate. | Resolve or classify every failure; full suite rerun green at the tagged commit; sign-off |

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

## Known residual TUI issues and active regressions

- Permission-gate rows (`◤`) intentionally disappear after decision — this is
  correct behavior, not a defect; durable approvals persist with
  `· exact request required`.
- `No full diff is attached to this spine entry` appears for entries without
  diff payloads by design.
- The LLM-composer connection error path ("Failed to send prompt / Unable to
  connect") is mitigated by F-22 but must be re-verified through the
  live-stream protocol.
- The 2026-08-22 full suite has shared SDK/project test-provider setup failures,
  renderer interaction failures, and voice/module-isolation failures. These are
  release blocking until the pinned-runtime rerun and root-cause classification
  are complete.

## Goal Verification and Memory Boundary

**Status: COMMITTED — goal verification and reserved memory keys are committed
in `5bb8d9e8`. Focused tests pass (63/0 across 6 files). Full TUI suite at
base `680ab7a1`: 1229 pass / 0 fail, 161 files (coordinator-verified; the
lexicon assertion fix landed on the line in `680ab7a1`, superseding PR #147).
The earlier "42 pre-existing failures" figure described the stale 2026-08-22
working-tree snapshot and no longer reproduces; BLK-GOAL-03 governs the
branch-tip result.**

## Open blockers

| ID | Blocks | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-GOAL-01 | Goal verification system operational | **COMMITTED (5bb8d9e8)**: deterministic gate + model verifier in `packages/engine/src/session/goal-verifier.ts`; goal state machine in `packages/core/src/session/goal.ts`; CLI agent verifier in `packages/arcana/src/agent/runner.ts`. Focused tests pass: goal-verifier.test.ts (5/0), goal.test.ts core (19/0), goal.test.ts engine (3/0), runner-proof.test.ts (4/0). | End-to-end verification: goal_set → work → goal_check complete → verifier rejects/verifies → goal archived/reopened. **DONE** in focused tests. Full suite green at exact commit: **DONE** (BLK-GOAL-03 closed). |
| BLK-GOAL-02 | Reserved memory keys isolation | **COMMITTED (5bb8d9e8)**: `isReservedMemoryKey()` in `packages/memory/src/store.ts`; filters in FACTS.md, cloud sync, prompts, search, CLI merge. Focused tests pass: store.test.ts (28/0), facts-md.test.ts (4/0). | Write-rejection + filtering verified in focused tests. **DONE**. Full suite green at exact commit: **DONE** (BLK-GOAL-03 closed). |
| BLK-GOAL-03 | TUI/engine suite green under pinned Bun | **RESOLVED**: on arcanagov the cited 42 `sdk.event.on` failures no longer reproduce — the SDK event mock was already fixed on the line. The single remaining failure was a stale assertion in `packages/tui/test/lexicon.test.ts` (`PLAIN_PLACEHOLDER.normal[0]` expected the old prompt string while `branding.ts` had moved on), fixed by a one-line test update that landed directly on the line in `680ab7a1` (PR #147 carried the identical change and is superseded). Full TUI suite verified by coordinator at base `680ab7a1`: **1229 pass / 0 fail**, 161 files. | Full suite run green at pinned Bun: **DONE** (1229/0). |

## CLI 1.0

**Status: PARTIAL — the commands exist and are tested (116/116 CLI/proof
tests), but the CLI 1.0 contract is not frozen.**

## Open blockers

| ID | Blocks (playbook §26–27) | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-CLI-01 | External-agent launch group (`arcana launch <runtime>`) | **Eleven A1 launch wrappers IMPLEMENTED by 2026-08-19**: codex, claude, gemini, hermes, opencode, cursor, aider, continue, cline, windsurf, and copilot share the bounded launch declaration, configurable binary/args/env, process supervision, and durable launch evidence. `launch-declaration.test.ts` pins A1 and its explicit nonclaims for every runtime; the 2026-08-22 focused launch tests pass. A1 does not claim sandboxing, exact-effect PEP mediation, or in-path file-read containment. Live Linux/macOS validation remains pending. | Declared A1 surface DONE for 11 runtimes; A2/A3 enforcement, live platform evidence, independent validation, and release freeze remain open |
| BLK-CLI-02 | Stable JSON output + deterministic documented exit codes for every command | **JSON output + deterministic exit codes IMPLEMENTED 2026-08-05 (PR #65)** (`packages/engine/src/cli/json-output.ts` + tests; `docs/cli-json-contract.md` publishes the `--json` contract and 0/1/2 exit-code scheme; session/node/trust converted). **Every-command coverage DONE 2026-08-09 (PR #113)**: `--json` + deterministic exit codes across remaining engine CLI commands (capability, cron, daemon, doctor, gateway, history, models, providers, run, serve) + legacy arcana handlers (history); converted-commands table frozen in the contract doc; `json-contract.test.ts` 8/0 + error/exit-code tests. Remaining: CLI 1.0 milestone freeze (BLK-1.0-02) | Command catalog with JSON schema + exit-code table (contract doc DONE via PR #65; every-command coverage DONE via PR #113); milestone freeze pending |
| BLK-CLI-03 | Shell completion | **Implemented 2026-08-05 (PR #67)**: bash (yargs built-in), zsh and fish (custom scripts). Remaining: none in-repo | DONE via PR #67: bash/zsh/fish completion scripts + 8 tests in completion.test.ts |
| BLK-CLI-04 | Cross-platform smoke (Windows/Linux/macOS) | Windows smoke matrix executed with 10 checks (10 pass / 0 fail) at commit 5263b6fa; **matrix published 2026-08-09 (PR #114)** (`docs/PLATFORM-SMOKE-MATRIX.md` + `script/platform-smoke.sh`, real Windows results); Linux/macOS NOT EXERCISED (no host; BLK-D-03 separate) | Platform matrix with smoke results (DONE via PR #114: Windows 10/10; Linux/macOS pending external host) |
| BLK-CLI-05 | CLI/TUI share the same runtime APIs with no CLI-only bypass | `arcana` CLI and TUI both route through the engine PEP. 2026-08-05: frozen cross-surface adversarial suite `packages/engine/test/cli/cross-surface-bypass.test.ts` — 18 fixtures, 18 pass / 0 fail, 0 bypasses. Covers: (1) session command endpoint + runtime API both route through `submitApprovalCommand`; (2) client-supplied `approvedBy`/`actorUserId`/`tenantId` ignored; (3) session A cannot act on session B (both surfaces); (4) `LOCAL_TUI`-routed approval rejects DESKTOP surface (CLI cannot claim Desktop); (5) stale hash → machine-readable stale, no execution; (6) duplicate approve refused (no double-spend); (7) `submitRoutingGate` rejects mismatched surface even with forged operator; (8) CLI command registry has no standalone approval-mutating subcommand (filesystem invariant). Typecheck clean (only pre-existing `manager.ts` error). Bypass count: **0** | CLI-only-bypass adversarial suite = 0 — **PASS** |

## Existing evidence

- `docs/FREEZE-RELEASE.md` (2026-08-02): command catalog,
  proposed JSON/NDJSON + exit-code contract, launch protocol, gate evidence.

- Governance/proof commands: `arcana epistemic proof inspect/verify/export`,
  `replay audit/deterministic`, `revalidate run` — 116/116 tests.
- Policy/capability: `arcana capability ...` (`packages/engine/src/cli/cmd/capability.ts`),
  approval CLI paths.
- Operations: `doctor`, `trust`, `models`, `providers`, `session list`,
  `daemon status/stop`, `serve`, `gateway`, `cron`, `memory`, `skills`.
- Shell completion: `arcana completion bash` (yargs built-in), `arcana completion zsh` (custom zsh script), `arcana completion fish` (custom fish script) — all three produce valid shell-specific completion scripts. Test suite: 8 pass / 0 fail in `src/cli/completion.test.ts`.

## Phase D — Distributed Governed Autonomy

**Status: Implementation coverage HIGH (in-repo) — D-7 FROZEN
(`arcana-phase-d7-local-distributed-authority`), D-8A proof batching, D-8B
end-to-end proof registration, D-6B-T delta/sync transport with node
persistence + compatibility negotiation, D-5 revocation store + emergency
push channel, D-6 execution ledger + governed distributed PEP, D-10 hostile
matrices (24 fixtures, 0 bypasses) implemented. Release readiness: BLOCKED —
TLS/mTLS + channel binding (BLK-D-07), live Linux validation (BLK-D-03),
Node 1.0 freeze (BLK-D-09), L3.**

## Open blockers

| ID | Task | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-D-01 | D-6B-T production authenticated transport | **Message-layer transport IMPLEMENTED 2026-08-02**: signed-envelope sync transport, replay store, HTTP `/api/sync/*`, sync client; **D-4 policy bundle store with POLICY_SNAPSHOT/POLICY_DELTA delivery**; **D-6 execution ledger + governed distributed PEP**; **D-5 revocation store + convergence measurement** (sequence-monotonic statements, REVOCATION_SNAPSHOT/REVOCATION_DELTA delivery, p50/p95 lag bounds; 10 tests). **DELTA bundles IMPLEMENTED + SERVED 2026-08-02** (`policy-delta.ts`; 4 core + 1 engine test). **Node-side delta validation DONE 2026-08-02** (`sync-client.ts`; 3 engine tests). **Node runtime persistence DONE 2026-08-02** (`sync-state.ts`; 4 engine tests). **Compatibility negotiation DONE 2026-08-02** (`compatibleFrom`/`compatibleTo`; 2 client + 2 server test assertions). **Emergency revocation push channel DONE 2026-08-02** (`GET /api/sync/revocations/stream` SSE: published revocation statements pushed to per-directory subscribers with per-connection sequence; publish and emergency-deny both broadcast; 1 integration test). Remaining: TLS/mTLS + channel binding (BLK-D-07) | MITM fixtures fail at message layer (DONE); TLS/mTLS handshake fixtures at deployment; PEP integration exercised (DONE); convergence bounds measured; push channel DONE |
| BLK-D-02 | D-7.1 kernel-enforced filesystem containment | `SafeBoundedFileReader` v2 is user-space; Linux `openat2 RESOLVE_BENEATH` implemented in `tools/fs-containment-rust`; **Windows opened-handle final-path reader implemented 2026-08-02** (lexical `..` rejection, reparse-point rejection per component, volume/file identity, final-path containment — 10/10 tests incl. real junction-escape fixture). **Hostile-escape fixtures made runnable in the core suite 2026-08-02** (`bounded-file-reader.test.ts`: traversal, absolute path, null byte, directory, size budget, junction escape; 7/7). **Engine file-read integration wired 2026-08-05** — production file-read path (`packages/engine/src/tool/read.ts` `read` tool) now routes all content reads through `SafeBoundedFileReader` via `packages/engine/src/util/bounded-file-read.ts`; hostile-escape fixtures at the real boundary in `packages/engine/test/tool/read-containment.test.ts` (traversal, absolute outside path, null byte, junction escape; 6/6, 0 bypasses); existing read suite 40/40, core reader suite 7/7, engine typecheck clean for changed paths (pre-existing unrelated `manager.ts` `ApprovalRecord.status` error remains). **Live Linux workload validation (BLK-D-03) remains separate — NOT claimed** | **Unblock requirements:** owner = engine engineering; artifact = production file-read path wired to `SafeBoundedFileReader` (+ native openat2/Windows handle reader where available); evidence = engine file-read integration test with hostile-escape fixtures at the real boundary + tag `arcana-phase-d7.1-filesystem-containment` + live Linux workload validation (BLK-D-03) |
| BLK-D-03 | D-6A-L live Linux workload identity | parser/TOCTOU tests exist; no live Linux workload validation | Live Linux workload validation results |
| BLK-D-04 | D-8B remote proof registration | **IMPLEMENTED END-TO-END 2026-08-02**: control-plane ledger + HTTP registration/reconciliation; node-side uploader/outbox/client; `arcana node proof upload` CLI wired to the **real local proof store** (`local-proof-source.ts`: ordered proofs, deterministic hashes, chained batches); hostile-node matrix (D-10). Remaining: nothing in-repo — TLS deployment + independent reproduction are the outstanding freeze gates | Upload loop wired (DONE); hostile-node matrix (DONE); node/server reconciliation exercised end-to-end (DONE) |
| BLK-D-05 | Node enrollment and key rotation | **Control-plane enrollment + node side IMPLEMENTED 2026-08-02**: core registry + HTTP endpoints + `arcana node enroll` CLI with restart-safe `node-identity-file.ts` identity store; rotated keys rejected over HTTP and by `verifyNodeKey`. **`arcana node key rotate` CLI DONE 2026-08-02**: generates/accepts a new seed, calls `POST /api/nodes/:nodeId/rotate`, persists the rotated identity (new secret/public key, epoch, certificate; `rotatedIdentity` helper, 1 test). Remaining: OS-level key protection (BLK-D-07) | Node-side ceremony client + key store restart-safe (DONE); rotated-key/unknown-node rejection exercised end-to-end (DONE); rotation CLI DONE |
| BLK-D-06 | D-9 partition/offline policy | Reducer (`D-4C`) implements the enforcement state machine; **offline grant/lease policy IMPLEMENTED 2026-08-02** (`offline-policy.ts`: offlineEnabled grants, min(grant expiry, lease end, per-grant override), approval-required denial, policy/revocation lease freshness, consequential window, doc-default config; 15 tests). **Offline policy WIRED into the distributed PEP + node-level partition suite 2026-08-05 (PR #63)** (`governed-distributed-pep.ts` D-9 offline request classification/gating; `offline-partition.test.ts`: partition, TTL, reconnection fixtures). Remaining: none in-repo | Partition tests match documented policy through the distributed PEP (DONE via PR #63); TTL enforcement (DONE); reconnection reconciliation (DONE) |
| BLK-D-07 | Operational deployment | **Runbook PUBLISHED 2026-08-05** (`docs/DEPLOYMENT-RUNBOOK.md`: topology, trust bootstrap with real `arcana node enroll`/`key rotate` ceremony + HTTP endpoints, backup/restore + DR via F7 HTTP API, monitoring via health endpoints + telemetry + SIEM + anomaly heuristics, fail-closed D-9 offline policy + D-5 revocation store; **TLS/mTLS confirmed NOT implemented** — plain HTTP only, documented as such). **Exercise record PUBLISHED 2026-08-05** (`docs/DEPLOYMENT-EXERCISE.md`: 18+ source files verified against runbook claims; TLS absence confirmed via negative search; **node ceremony NOT EXERCISED — Bun runtime not installed on exercise machine**; backup/restore/server startup/daemon/doctor/mDNS all NOT EXERCISED — Bun required). Remaining: TLS/mTLS + channel binding (BLK-D-07 register row external gate), live Linux (BLK-D-03 separate) | Runbook + exercised topology (both DONE 2026-08-05); TLS/mTLS deployment + OS key protection remain open per external gate |
| BLK-D-08 | D-10 hostile-node adversarial evaluation | **Frozen matrix IMPLEMENTED 2026-08-02** (`hostile-node-evaluation.test.ts`): 15 fail-closed fixtures across all ten categories (forged grants, wrong audience, replay, clock skew incl. new future-issuedAt freshness check, key rotation, delayed revocation, partition, duplicate execution, proof omission, node replacement) — 0 bypasses. **Revocation hostile suite ADDED 2026-08-02** (`revocation-hostile.test.ts`): 9 fail-closed fixtures — forged signature, unknown issuer, schema-invalid, future-dated (freshness check now applies to envelopes without `expiresAt`), non-genesis first sequence, sequence rollback, duplicate-sequence content change, revoked-subject resurrection — 0 bypasses. Remaining: independent reproduction + Node 1.0 freeze linkage | Forged grants, wrong audience, replay, clock skew, key rotation, delayed revocation, partition, duplicate execution, proof omission, node replacement — all zero (DONE in-repo); revocation hostile fixtures zero (DONE); L3 independent reproduction |
| BLK-D-09 | Node 1.0 freeze | **API contract draft published 2026-08-02** (node-1.0-api-contract: frozen HTTP/CLI/core surface + §31 gate evidence + outstanding gates). **DELTA bundles DONE 2026-08-02** + **emergency revocation push channel DONE 2026-08-02** (SSE). Release freeze NOT authorized: TLS/mTLS (BLK-D-07), live Linux validation (BLK-D-03), independent reproduction pending | §31 gates all zero + milestone tag after outstanding gates close |

## Partial evidence (already implemented)

| Task | Status evidence |
|---|---|
| D1 node identity | envelope/contracts exist; enrollment pending (BLK-D-05) |
| D2 signed short-lived grants | envelope schema + 7-layer verifier + 46 cross-runtime conformance vectors (41 negative) + Rust conformance 2/2 |
| D3 mutual authentication | D-6B authenticated sync control exists; production transport pending (BLK-D-01) |
| D4 policy distribution | envelope carries policy digest chains; signed bundle distribution pending |
| D5 remote revocation | revocation envelopes, durable state, sync protocol exist; convergence measurement pending |
| D6 replay resistance | reducers/durable state/sync protocol exist; duplicate-execution matrix pending |
| D7 proof synchronization | FROZEN local milestone (`017ad998`); kernel containment is BLK-D-02 |
| D8 proof composition | D-8A local batching implemented; D-8B remote registration pending (BLK-D-04) |

## Performance gates not yet measured

Signature verification p95 < 2 ms, local grant validation p95 < 5 ms, connected
revocation p95 within risk target, proof-segment enqueue p95 < 10 ms, node
startup to enforcement-ready — all pending measurement infrastructure.

## Phase E — Protocol, SDKs, Adapters

**Status: PLANNED / PARTIAL — no frozen protocol, no certified adapters, no
stable SDK 1.0.**

## Open blockers

| ID | Task | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-E-01 | E1 freeze protocol specifications | **Freeze draft published 2026-08-02** (PROTOCOL-1.0-SPEC): serialization rules, signature domains, object registry, labels, reason codes, version negotiation. Remaining: public release, external review, third-party implementation | Versioned public specs (DRAFT DONE); external review + public release |
| BLK-E-02 | E2 independent conformance suite | **Independent implementations DONE 2026-08-02**: TS production + Rust verifier agree on 46 vectors (`script/conformance.ts` runner, now 5/5 suites). Remaining: L3 external reproduction | Two independent implementations produce matching vectors (DONE in-repo); external reproduction |
| BLK-E-03 | E3 TypeScript/JavaScript SDK 1.0 | **Governance + proof + error model + conformance wiring DONE 2026-08-02** (`@arcana/sdk/v2/*`; SDK suite 34/0 full `src`; conformance runner 5/5; `SDK-1.0-COMPATIBILITY.md`). Remaining: release freeze + external-vector conformance | SDK 1.0 release + external conformance |
| BLK-E-04 | E4 additional language SDK | **Rust foundation DONE 2026-08-02**: canonical serializer + verifier + request hashing with cross-language golden vector (TS ↔ Rust identical hash). **Envelopes + PEP decision client IMPLEMENTED 2026-08-05 (PR #64)** (`tools/acep-conformance-rust/src/envelope.rs`: sign/verify with fixed keypairs; `pep.rs`). **Proof-batching parity DONE 2026-08-09 (PR #117)** (`tools/acep-conformance-rust/src/proof_batch.rs` + `tests/proof_batch_parity.rs`: TS↔Rust batch-root/merkle parity, gap/duplicate detection; full Rust suite 112 pass / 0 fail, 16/16 parity tests). Remaining: full Rust SDK surface beyond proof parity (freeze + L3 external) | One additional SDK passing the same conformance suite (request-hash vector PASS; envelope/PEP client DONE via PR #64; proof-batching parity DONE via PR #117; full surface freeze + L3 pending) |
| BLK-E-05 | E5 external CLI adapters | **Eleven runtimes declare the same A1 contract by 2026-08-19**: codex, claude, gemini, hermes, opencode, cursor, aider, continue, cline, windsurf, and copilot. Shared launch machinery provides configuration, supervision, and durable evidence; tests pin the declaration and explicit nonclaims. Remaining: A2/A3 enforcement, live Linux/macOS evidence, external validation, and freeze. | Eleven A1 declarations DONE; stronger certification and external/platform evidence pending |
| BLK-E-06 | E6 framework adapters (Mastra/AI SDK/LangGraph/MCP apps) | **AI SDK-style + MCP hooks DONE 2026-08-02** (`governedTool` + `governedMcpTool`). **Mastra + LangGraph hooks DONE 2026-08-02** (`governedMastraTool` + `governedLangGraphTool`; 6 new tests, SDK suite 28/28). **Live PEP HTTP transport DONE 2026-08-12** (`src/v2/live-pep.ts`, commit `1eab77ae`: `createLivePepClient` implements `authorize` + `executeExact` by POSTing the canonical AuthorizationRequest to `POST /api/pep/decide` (documented engine transport contract), mapping ALLOW/DENY/REQUIRE_APPROVAL + approval ids to SDK outcomes/errors; approval command helpers against the live runtime surface (`/approvals/:approvalID/approve|deny|revoke` with `RuntimeApprovalCommandPayload`); fail-closed on transport errors; wired factories `governedToolWithLivePep` + `governedMcpToolWithLivePep` + `governedMastraToolWithLivePep` + `governedLangGraphToolWithLivePep`; 18 new tests, SDK suite 55/55, typecheck 0). Remaining: engine decision-endpoint mount, L3/external validation | Framework tool calls map to canonical requests (DONE); PEP cannot be bypassed (hook-level DONE for AI SDK/MCP/Mastra/LangGraph; live transport DONE — engine decision-endpoint mount + L3/external pending) |
| BLK-E-07 | E7 adapter certification levels | **Registry published 2026-08-02** (`ADAPTER-CERTIFICATION.md`: A0–A3, procedure, nonclaims). Remaining: fixtures per adapter | Certification contract (DONE); per-adapter fixture results |
| BLK-E-08 | E8 developer experience and examples | **DX package DONE 2026-08-05**: `docs/QUICKSTART.md` (SDK + CLI + governance + proofs), `docs/SECURITY-CHECKLIST.md`, `examples/reference-app/` (typed against real SDK/engine/core exports incl. `ApprovalCommandPayload`, `RuntimeApprovalCommandPayload`, `AuthenticatedOperator`, `ApprovalRecord`), `examples/samples/` (sdk-client, governance-policy, proof-verify, cli-headless). **REAL typecheck PASS 2026-08-22**: `bunx --bun tsc -p examples/reference-app/tsconfig.json --noEmit` AND `-p examples/samples/tsconfig.json` both exit 0 with 0 errors. The typecheck fixes live in THIS branch's commit `a674ee3f` (this PR); the evidence checkpoint `8d00058b` predates them and still contains the failing call sites and old tsconfigs — run the two `tsc` commands at this PR's head to reproduce the pass. Fixes required to get there: (1) reference-app tsconfig `effect` paths targeted the package root of an exports-only beta package (no `main`/`types`) — retargeted to `dist` dts; (2) added `*.wasm` ambient declaration for the engine's import-attributes wasm import; (3) 4 real call-site defects in reference-app — Effect Schema decodes version/contractRevision as a `number \| string` union, command payloads now coerce via `Number()`; (4) samples tsconfig lacked Bun types + txt/wasm ambient declarations — added `typeRoots` → engine's `@types/bun`, `"types": ["bun"]`, ambient `*.txt`/`*.wasm` module declarations | DX package + security checklist (DONE); tsc pass (DONE 2026-08-22) |
| BLK-E-09 | E9 protocol governance and compatibility | PROTOCOL-GOVERNANCE published (lifecycle, deprecation, advisory, extensions, matrix); **registry enforcement DONE (PR #120, 2026-08-13)**: extension registry validated in envelope + policy bundle validation, wired into verifier + policy-bundle-store | **Registry enforcement (DONE via PR #120)**: validateExtensionRegistry + DEFAULT_EXTENSION_REGISTRY in packages/core/src/protocol/extension-registry.ts (with tests), wired into policy-bundle-store + verifier; PROTOCOL-GOVERNANCE doc DONE; no remaining in-repo work |
| BLK-E-10 | E10 ecosystem evaluation and freeze | **Matrix published 2026-08-02** (`ECOSYSTEM-EVALUATION.md`: runtimes, languages, OSes, levels + freeze-gate status with evidence). **Certified adapter fixtures DONE 2026-08-02** (`src/v2/adapters/vectors.test.ts`: 4 frozen request-hash golden vectors for AI SDK/MCP/Mastra/LangGraph naming with pinned request identity; wired into `script/conformance.ts` as suite 5/5; `GovernanceContext` gained deterministic `requestId`/`nonce`/`requestedAt`). **Live PEP transport DONE 2026-08-12** (see BLK-E-06). Remaining: macOS/Linux validation, L3 | Matrix (DRAFT DONE); certified fixtures DONE; freeze pending live/L3 |

## Existing partial evidence

- `tools/acep-conformance-rust` — canonical node-identity + 46-vector conformance (2/2 tests).
- SCHEMA-VERSION-REGISTRY — schema version registry draft.
- `packages/sdk/js` — typed client and server spawner (7/7).
- 2026-08-02 market assessment — external adapter analysis.

## Phase F — Enterprise Control Plane

**Status: Service-core implementation HIGH — F1–F13 cores implemented
(`packages/core/src/enterprise/*`) and mounted on `/api/enterprise/*` + SDK
client; Production mounting SUBSTANTIAL; Secure production boundary RESOLVED
(BLK-F-AUTH-01 fixed via PR #53, 2026-08-03); Release readiness BLOCKED
(remaining operator console work, live exercises, F13 external assessment).**

## Open blockers

| ID | Task | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-F-01 | F1 multi-tenant organization model | **Tenant model + SQLite store IMPLEMENTED 2026-08-02** (all 10 entity kinds tenant-scoped; tenant-filtered queries; deletion isolation; 3 tests). **HTTP tenant-isolation adversarial suite DONE 2026-08-05 (PR #71)** (`packages/engine/test/server/httpapi-tenant-isolation.test.ts`: cross-tenant reads/mutations fail closed at the effect boundary). **Retention documented** (`docs/architecture/tenant-retention.md`: deletion semantics, legal hold, archive retention). Remaining: none in-repo | Tenant-isolation adversarial suite (core DONE; HTTP surface DONE via PR #71); deletion/retention documented (DONE) |
| BLK-F-02 | F2 enterprise identity and access | **RBAC core DONE 2026-08-02** (tenant-scoped roles + permission matrix, privileged audit, immediate deprovisioning, time-bounded break-glass; 5 tests). **Manager governance endpoint MOUNTED 2026-08-05 (PR #70)** (`GET /manager/governance` via `packages/engine/src/server/routes/instance/httpapi/groups/manager.ts` + handlers: read-only governance discovery + durable approval-count summary; grants no authority). Remaining: SSO/SCIM/MFA service integration, service accounts, separation-of-duties | Deprovisioning bound (0 ms core; SSO propagation pending); privileged actions audited (DONE); break-glass time-bounded (DONE) |
| BLK-F-03 | F3 central policy management | **Lifecycle DONE 2026-08-02** (D-4 signed store: validation-before-activation, staged rollout, transactional rollback, RunProof digest proof; F3: approved promotion + diff, 6 tests). **HTTP promotion/diff MOUNTED 2026-08-02** (`/api/enterprise/*/policies/*`: RBAC-checked promotion into per-environment target chains, structural diff; integration tested). **Draft validation IMPLEMENTED + MOUNTED 2026-08-02** (`policy-drafts.ts`: validate signed candidate against live chain without publishing — schema, signature, chain continuity; 2 core + 1 integration test). Remaining: simulation editor UI | Activation requires validation (DONE); rollback transactional (DONE); nodes prove policy digest (DONE via RunProof); authoring validation DONE; simulation editor pending |
| BLK-F-04 | F4 fleet and node operations | **Fleet core DONE 2026-08-02** (tenant inventory, health derivation, heartbeats, upgrade rings, backlog; 3 tests). **HTTP register/heartbeat/fleet-view/node-diagnostics MOUNTED 2026-08-02** (integration tested). **Upgrade-ring rollout IMPLEMENTED + MOUNTED 2026-08-02** (ring CRUD, node assignment, gated rollout plans; 3 core + 1 integration test) | Fleet view distinguishes unknown/healthy (DONE); stale nodes explicit (DONE); diagnostics DONE; rollout automation DONE (core) |
| BLK-F-05 | F5 central approval operations | **Central queue DONE 2026-08-02** (exact inspection, separation of duties, expiry, bulk deny only, emergency revocation; 4 tests; local PEP remains the execution authority). **Escalation core + HTTP MOUNTED 2026-08-02** (bounded fallback approvers, audited events, never consumes approvals; 4 core + 1 integration test). **Approvals list endpoint MOUNTED 2026-08-02** (`GET /api/enterprise/*/approvals` with status filter; integration tested). **Escalation console MOUNTED 2026-08-04 (PR #68)** (`packages/enterprise/src/routes/escalation.tsx` — route renders approval list with status filter, inspection fields (id/hash, requester, status, timestamps), truncated hashes, and escalation check actions; `packages/enterprise/src/core/escalation-console.test.ts` — 6 tests passing). **Console api proxy forwarding DONE 2026-08-12** (`e59f9fd6`; `packages/enterprise/src/core/enterprise-proxy.ts` + `src/api-app.ts`: `/api/enterprise/*` forwarded to the engine via `ARCANA_ENGINE_BASE_URL` (default `http://localhost:4096`); method/headers/query preserved, engine 404/5xx propagate, fail closed 502/503 JSON, never silent 200; 12 tests). Remaining: none within console scope. | Exact single-use approvals across network (core DONE); central UI cannot bypass local PEP (DONE by design); delegated approver authority bounded (DONE, tested); console mounted and tested; console api proxy forwarding DONE |
| BLK-F-06 | F6 audit/compliance/evidence archive | **Archive core DONE 2026-08-02** (immutable retention, fingerprint-verified export, custody chain, legal hold, tenant isolation; 4 tests; auditor read-only enforced via F2 RBAC). **HTTP archive/export/custody/legal-hold/retention-sweep MOUNTED 2026-08-02** (integration tested). **Compliance crosswalk PUBLISHED 2026-08-02** (PHASE-F-COMPLIANCE-CROSSWALK: SOC 2 / ISO 27001 / NIST mapping; certification explicitly not claimed). **Auditor console MOUNTED 2026-08-04 (PR #69)** (read-only UI at /auditor: event table, archive export with fingerprint + custody chain, legal hold, retention sweep; 11 helper tests) | Exported proof verifies independently (fingerprint DONE; SDK verifier available); auditor read-only tenant-scoped (DONE via RBAC); mappings DONE (engineering index; formal certification external) |
| BLK-F-07 | F7 HA/DR | **Core DONE 2026-08-02** (targets, digest-verified backup/restore, drill evaluation, degraded fail-closed; 3 tests). **HTTP backup/restore/drill MOUNTED 2026-08-02** (integration tested). **Key backup + rotation automation DONE 2026-08-12** (`99b0ddf0`; `packages/core/src/enterprise/key-rotation.ts` + SQLite: dry-run preview vs confirmed rotation (GENERATE/RECEIVE modes) advancing the D-1 enrollment registry epoch via existing `rotateNodeKey`, tenant-scoped evidence via `withTenantAccess`, superseded keys keep failing the epoch gate; digest-verified key backup + fingerprint-gated restore in reliability.ts; HTTP preview/rotate/backup/restore mounted + audited as privileged node.manage; 6 core + 3 engine tests). Remaining: live multi-region DR exercise | Restore drills meet RPO/RTO (evaluator DONE; live exercise pending); fail-closed behavior matches policy (DONE); key backup/rotation automation DONE (core + HTTP + tests) |
| BLK-F-08 | F8 federation | **Core DONE 2026-08-02** (agreements, authority intersection, conflict resolution, proof exchange, revocation propagation; 5 tests). **HTTP agreements/exchange/revocation/intersection MOUNTED 2026-08-02** (integration tested). **Cross-org approval routing IMPLEMENTED + MOUNTED 2026-08-02** (exact action grants, daily caps, agreement validity; 3 core + 1 integration test). **Federated revocation transport IMPLEMENTED + MOUNTED 2026-08-02** (`federation-transport.ts` + SQLite: outbox/inbox exchange, agreement-validated queue/receive, delivery state, dedup; 3 core + 1 integration test). Remaining: live network delivery + channel binding in ops deployment | Federation intersects authority (DONE); unknown issuer fails closed (DONE); delegated approver authority bounded (DONE, tested); revocation transport exchange DONE; live delivery pending (ops) |
| BLK-F-09 | F9 enterprise security operations | **Core DONE 2026-08-02** (alerts, incident timelines, audited revocation campaigns, forensic exports; 3 tests). **HTTP alerts/timeline/campaign/forensic MOUNTED 2026-08-02** (RBAC-checked; integration tested). **Anomaly detection IMPLEMENTED + MOUNTED 2026-08-02** (`anomaly.ts`: alert-burst/revocation-velocity/backlog/stale-ratio heuristics recorded through the alert pipeline; 3 core + 1 integration test). Remaining: compromise simulation (operator exercise) | Compromise simulation pending (operator exercise); emergency deny propagation (DONE, audited); anomaly heuristics DONE |
| BLK-F-10 | F10 data governance and privacy | **Core DONE 2026-08-02** (classification, regional/CMK constraints, PII export control + retention; 3 tests). **HTTP governance checks MOUNTED 2026-08-02** (storable/exportable/classify/PII-retention; integration tested). **Regional storage + CMK enforcement IMPLEMENTED 2026-08-05 (PR #66)** (`data-governance.ts`: assertStorageAction/assertCmkRequired; `data-governance-store.ts`: region_data_classes + cmk_keys SQLite stores; PII must be encrypted at rest; policy stores, no cloud SDK calls). Remaining: real KMS/cloud provider integration | Contracts documented (DONE); regional storage + CMK policy enforcement DONE (PR #66); real KMS provider integration pending |
| BLK-F-11 | F11 enterprise API and automation | **Admin HTTP surface MOUNTED 2026-08-02** (`/api/enterprise/*`: F1-F12 cores mounted; 18 HTTP integration tests) + **admin-event store + SIEM CEF export MOUNTED 2026-08-02** (4 core + 1 integration test) + **ticketing payloads IMPLEMENTED + MOUNTED 2026-08-02** (`ticketing.ts`; 1 core + 1 integration test) + **webhook delivery sink IMPLEMENTED + MOUNTED 2026-08-02** (`webhooks.ts` + SQLite: endpoint registry, auto-enqueue on admin events, bounded retry/backoff, durable delivery state; 4 core + 1 integration test) + **SDK enterprise admin client (equivalent automation) DONE 2026-08-02** (`packages/sdk/js/src/v2/enterprise.ts`; 4 SDK tests). **Live ticketing transport adapters DONE 2026-08-05 (PR #73)** (`TicketTransport` interface + Jira adapter + webhook adapter; SQLite-backed durable delivery, dedup by idempotency key, retry/backoff; 9 tests). Remaining: optional Terraform provider | Admin API + webhooks + automation tested (core HTTP surface DONE; SIEM export DONE; ticketing payloads DONE; webhook delivery DONE; equivalent automation DONE via SDK client; live ticketing adapters DONE via PR #73) |
| BLK-F-12 | F12 commercial readiness | **Core DONE 2026-08-02** (entitlements, metering-never-affects-security invariant, redacted diagnostics, upgrade policy; 4 tests). **Metering pipeline core + HTTP MOUNTED 2026-08-02** (usage aggregation, informational quota; 3 core + 1 integration test). **Usage export endpoint DONE 2026-08-02** (`GET /api/enterprise/*/commercial/usage/export`: per-feature totals; integration tested). **Telemetry ingestion from engine events DONE 2026-08-03** (`ea5b922f`). Remaining: license text review | Metering never affects security decisions (DONE, tested); telemetry ingestion DONE; docs complete (DRAFT) |
| BLK-F-13 | F13 independent security assessment and GA freeze | **Freeze draft published 2026-08-02** (`docs/FREEZE-RELEASE.md` §Phase F: §40 gate evidence + operational gates). **Escalation + auditor consoles MOUNTED 2026-08-04 (PRs #68/#69)**; authenticated-principal binding resolved (PR #53, 2026-08-03). **External-assurance machinery implemented 2026-08-22**: full-platform L3/L4 schemas and Ed25519 verifier; exact-candidate artifact/deployment binding; separate-party and trusted-key enforcement; protected evidence import and same-commit RC promotion; two-pass L4 runbook; public-summary/NDA contract; zero-open Critical/High/Medium/Low gate. This is infrastructure, not an assessment. Remaining: external L3 reproduction; independent architecture, threat-model, penetration, supply-chain, and remediation review; hardened Linux deployment controls/evidence; live exercises. | Blockers resolved + milestone frozen (code, operational, and external gates) |
| BLK-F-AUTH-01 | P0 authenticated administrative identity binding | Enterprise administrative mutations must derive actor and tenant identity from authenticated server context. Client-supplied `actorUserId`, `approvedBy`, `tenantId`, or equivalent body fields must not establish authority or audit attribution. Current state: enterprise mutation payloads accept client-supplied actor fields; RBAC decision core PASS, authenticated HTTP boundary NOT implemented. 2026-08-03: the runtime approval surface (approve/deny/revoke) closed the same pattern: operator identity is derived from the authenticated server context and body fields are rejected/ignored; the enterprise admin surface remains open | Authenticated principal → tenant → role → permission; body actor attribution rejected or ignored; cross-tenant impersonation fixtures fail closed; forged approver fixtures fail closed; audit records use the authenticated principal. Fix PR merged: #53 (enterprise auth boundary), 2026-08-03 |

## Phase F hard gates (playbook §40)

Cross-tenant data leaks, federation authority amplification, central approval
bypass of local PEP, unverifiable compliance exports, restore drills outside
RPO/RTO, unresolved critical pen-test findings, and false-positive fleet
health require the F1–F13 implementations above before they can be measured.

Unauthorized administrative actions: RBAC decision core PASS (F2 permission
matrix + privileged audit); authenticated administrative HTTP boundary
BLOCKED by BLK-F-AUTH-01 (client-supplied actor identity must not establish
authority or audit attribution).

## Arcana 1.0 Convergence

**Status: NOT REACHED.** Arcana 1.0 (playbook §42–43) requires Phase A–C
complete, TUI 1.0 complete, CLI 1.0 complete, a stable local
installer/update path, stable policy and RunProof schemas, at least one
production-quality external-agent adapter, complete operator documentation,
and signed release artifacts.

## Open blockers

| ID | Blocks | Evidence / gap | Acceptance evidence required |
|---|---|---|---|
| BLK-1.0-01 | TUI 1.0 complete | TUI-2.1 freeze not authorized | Runbook Gates 1–10 at the final commit + sign-off |
| BLK-1.0-02 | CLI 1.0 complete | JSON/exit-code contract frozen via PR #113 (converted-commands table + 0/1/2 scheme; every-command coverage DONE); 11 launch wrappers declare A1 | CLI 1.0 milestone frozen |
| BLK-1.0-03 | one production-quality external adapter | Eleven `arcana launch` wrappers declare A1 with supervision and durable evidence, but A1 explicitly lacks sandboxing and exact-effect PEP mediation. The earlier register treated declaration-level A1 as sufficient; the current release gate requires live platform evidence and an explicit human decision that A1 is adequate for Arcana 1.0, or one adapter must reach A2/A3. | Live platform evidence plus human acceptance of A1 for 1.0, or one A2/A3 adapter; exact nonclaims preserved |
| BLK-1.0-04 | signed release artifacts + stable installer/update path | pre-release builds only; **release-flow plan published 2026-08-02** (`docs/FREEZE-RELEASE.md`: verify → freeze/tag → build → sign → installer/update smoke → publish → promote → post-verify) but NOT executed | Signed artifacts, installer/upgrade data-loss tests = 0 |
| BLK-1.0-05 | mainline promotion | `master`/`origin/master` stale; Phase B/C/D-7/TUI-2 commits not on mainline; promotion step defined in the release-flow plan | `master` fast-forwarded to the verified release commit |

## Additional release evidence requirements

- Local unauthorized executions in frozen suite: 0 (Phase C evidence exists).
- TUI/CLI authorization disagreements: 0 (frozen adversarial cross-surface
  suite pending — see BLK-CLI-05).
- Proof verification regressions: 0 (Phase B suites green).
- Supported-platform smoke tests: 100% (Windows done; Linux/macOS pending —
  BLK-CLI-04).

## Rules for closing a blocker

- A blocker closes only when the acceptance evidence exists **and** is
  recorded in this register with a date, commit, and verification command.
- Closing a blocker never happens by re-scoping the playbook without an
  explicit architecture decision record (playbook §52, AGENTS.md completion
  gate).
- Security blockers (`unauthorizedExecutions != 0`, amplification, replay,
  bypass) are terminal: the phase cannot be declared complete with any open
  security blocker.
- The completion report at `docs/COMPLETION-REPORT.md`
  is the checkpoint-level summary of this register.

## Task traceability

Every task row in the playbook and every new task added during this audit is
tracked in:

- `docs/TASKS.md` — living per-task status register (Part 1) and task →
  evidence → gate trace (Part 2).

## External and human gates (owner / artifact / evidence)

These gates cannot be closed from the repository. Each row names the owner,
the artifact that must be produced, and the evidence that closes it.

| Gate | Owner | Artifact | Evidence required to unblock |
|---|---|---|---|
| TLS/mTLS + channel binding + OS-level key protection (BLK-D-07) | Ops + release engineering | Server/node transport config with mTLS and channel binding; OS key protection | TLS handshake fixtures at deployment; MITM confidentiality test |
| Live Linux workload validation (BLK-D-03) | Engineering + Linux ops | Live Linux node run (D-6A-L workload identity) | Live workload-identity validation report |
| Live DR / compromised-node / key-rotation exercises | Operator + engineering | Exercised environment + drill records | DR drill meets RPO/RTO; compromised-node exercise log; key-rotation exercise log (BLK-F-07/09) |
| TUI-2.1 manual matrices | Operator + engineering | TUI at the exact freeze commit | Runbook Gates 1–10: smoke, width 59–180, themes, approval lifecycle, restart/session isolation, performance, 6-checkpoint SSE protocol (AUD-01..08) |
| F13 external security assessment | External assessor | Assessment report | Architecture review, penetration test, threat-model review, supply-chain assessment, remediation verification |
| L3 independent reproduction | External party | Independent rerun of the frozen suites | L3 reproduction report (AUD-20) |
| License text review | Legal | Reviewed license texts | Legal sign-off (BLK-F-12) |
| Node 1.0 freeze | Maintainer + human sign-off | Node 1.0 API contract at the exact commit | TLS/live-Linux/L3 cleared + freeze sign-off (BLK-D-09) |
| Phase F / Control 1.0 freeze | Maintainer + human sign-off | GA freeze evidence pack | All playbook §40 gates measured + sign-off (BLK-F-13) |
| Arcana 1.0 release sign-off | Release + human sign-off | Signed release artifacts + installer | Playbook §43 gates + executed release-flow records (BLK-1.0-04/05) |

None of these gates may be declared complete without its artifact and
recorded evidence; see `docs/FREEZE-RELEASE.md` for the execution
order once the freeze sign-offs exist.
