# Arcana Blocker Register (consolidated)

**Document class:** blocker register (evidence-backed)
**Authority:** secondary — status decisions live in `docs/STATUS.md`
**Created:** 2026-08-02 (Phase A–F completion audit)
**Consolidated:** 2026-08-02 — single register replacing the former `docs/blockers/` folder
**Implementation checkpoint:** `63d71f07` (2026-08-03; upstream advanced from `0392ad7b` via merged PRs #43–47)
**Documentation reconciliation commit:** `882ea468` (baseline for the consolidated files)

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
| TUI 1.0 (TUI-2.1 freeze) | MOUNTED, automated green, freeze NOT authorized | 8 | [§TUI 1.0 / TUI-2.1](#tui-10--tui-21) |
| CLI 1.0 | PARTIAL — no frozen contract | 5 | [§CLI 1.0](#cli-10) |
| Phase D — Distributed Governed Autonomy | Implementation coverage: HIGH; release readiness: BLOCKED | 9 | [§Phase D](#phase-d--distributed-governed-autonomy) |
| Phase E — Protocol, SDKs, Adapters | PARTIAL — conformance 5/5 + adapters + certified vectors; freeze pending live/L3 | 10 | [§Phase E](#phase-e--protocol-sdks-adapters) |
| Phase F — Enterprise Control Plane | Service cores: HIGH; mounting: SUBSTANTIAL; auth boundary: BLOCKED (BLK-F-AUTH-01); release: BLOCKED | 14 | [§Phase F](#phase-f--enterprise-control-plane) |
| Arcana 1.0 convergence | NOT reached | 5 | [§Arcana 1.0](#arcana-10-convergence) |


## Phase A — Epistemic Foundation

**Status: COMPLETE / FROZEN** (declared complete in the master spec and
`docs/STATUS.md`; tag lineage contained in `phase-d-implementation`).

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
TUI-2.1 MOUNTED and AUTOMATED GREEN, freeze NOT AUTHORIZED.**

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

## CLI 1.0

**Status: PARTIAL — the commands exist and are tested (116/116 CLI/proof
tests), but the CLI 1.0 contract is not frozen.**

## Open blockers

| ID | Blocks (playbook §26–27) | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-CLI-01 | External-agent launch group (`arcana launch codex/claude/gemini`) | A1 scaffold implemented (`launch.ts`: declaration, `--dry-run`, supervision, durable launch evidence); **no sandbox/enforcement claim**; production-certified adapter pending | One production adapter reaches a declared certification level; others documented |
| BLK-CLI-02 | Stable JSON output + deterministic documented exit codes for every command | JSON/exit-code contract not frozen in a spec | Command catalog with JSON schema and exit-code table, tested |
| BLK-CLI-03 | Shell completion | Implemented — bash (yargs built-in), zsh and fish (custom scripts) | Completion scripts for bash/zsh/fish + 8 tests in completion.test.ts |
| BLK-CLI-04 | Cross-platform smoke (Windows/Linux/macOS) | Windows primary; Linux scaffold only (D-6A-L pending) | Platform matrix with smoke results |
| BLK-CLI-05 | CLI/TUI share the same runtime APIs with no CLI-only bypass | `arcana` CLI and TUI both route through the engine PEP. 2026-08-03: runtime approval API + session command surface both drive the same `submitApprovalCommand` service with a surface-bound routing gate; TUI HTTP bridge test pins the command endpoint and body; adversarial tests cover client-supplied identity rejection and session isolation. Bypass audit as one frozen cross-surface suite still pending | CLI-only-bypass adversarial suite = 0 |

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
offline PEP wiring (BLK-D-06), Node 1.0 freeze (BLK-D-09), L3.**

## Open blockers

| ID | Task | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-D-01 | D-6B-T production authenticated transport | **Message-layer transport IMPLEMENTED 2026-08-02**: signed-envelope sync transport, replay store, HTTP `/api/sync/*`, sync client; **D-4 policy bundle store with POLICY_SNAPSHOT/POLICY_DELTA delivery**; **D-6 execution ledger + governed distributed PEP**; **D-5 revocation store + convergence measurement** (sequence-monotonic statements, REVOCATION_SNAPSHOT/REVOCATION_DELTA delivery, p50/p95 lag bounds; 10 tests). **DELTA bundles IMPLEMENTED + SERVED 2026-08-02** (`policy-delta.ts`; 4 core + 1 engine test). **Node-side delta validation DONE 2026-08-02** (`sync-client.ts`; 3 engine tests). **Node runtime persistence DONE 2026-08-02** (`sync-state.ts`; 4 engine tests). **Compatibility negotiation DONE 2026-08-02** (`compatibleFrom`/`compatibleTo`; 2 client + 2 server test assertions). **Emergency revocation push channel DONE 2026-08-02** (`GET /api/sync/revocations/stream` SSE: published revocation statements pushed to per-directory subscribers with per-connection sequence; publish and emergency-deny both broadcast; 1 integration test). Remaining: TLS/mTLS + channel binding (BLK-D-07) | MITM fixtures fail at message layer (DONE); TLS/mTLS handshake fixtures at deployment; PEP integration exercised (DONE); convergence bounds measured; push channel DONE |
| BLK-D-02 | D-7.1 kernel-enforced filesystem containment | `SafeBoundedFileReader` v2 is user-space; Linux `openat2 RESOLVE_BENEATH` implemented in `tools/fs-containment-rust`; **Windows opened-handle final-path reader implemented 2026-08-02** (lexical `..` rejection, reparse-point rejection per component, volume/file identity, final-path containment — 10/10 tests incl. real junction-escape fixture). **Hostile-escape fixtures made runnable in the core suite 2026-08-02** (`bounded-file-reader.test.ts`: traversal, absolute path, null byte, directory, size budget, junction escape; 7/7). **Engine integration NOT unblocked per register — documented as a blocker 2026-08-02** (see acceptance evidence) | **Unblock requirements:** owner = engine engineering; artifact = production file-read path wired to `SafeBoundedFileReader` (+ native openat2/Windows handle reader where available); evidence = engine file-read integration test with hostile-escape fixtures at the real boundary + tag `arcana-phase-d7.1-filesystem-containment` + live Linux workload validation (BLK-D-03) |
| BLK-D-03 | D-6A-L live Linux workload identity | parser/TOCTOU tests exist; no live Linux workload validation | Live Linux workload validation results |
| BLK-D-04 | D-8B remote proof registration | **IMPLEMENTED END-TO-END 2026-08-02**: control-plane ledger + HTTP registration/reconciliation; node-side uploader/outbox/client; `arcana node proof upload` CLI wired to the **real local proof store** (`local-proof-source.ts`: ordered proofs, deterministic hashes, chained batches); hostile-node matrix (D-10). Remaining: nothing in-repo — TLS deployment + independent reproduction are the outstanding freeze gates | Upload loop wired (DONE); hostile-node matrix (DONE); node/server reconciliation exercised end-to-end (DONE) |
| BLK-D-05 | Node enrollment and key rotation | **Control-plane enrollment + node side IMPLEMENTED 2026-08-02**: core registry + HTTP endpoints + `arcana node enroll` CLI with restart-safe `node-identity-file.ts` identity store; rotated keys rejected over HTTP and by `verifyNodeKey`. **`arcana node key rotate` CLI DONE 2026-08-02**: generates/accepts a new seed, calls `POST /api/nodes/:nodeId/rotate`, persists the rotated identity (new secret/public key, epoch, certificate; `rotatedIdentity` helper, 1 test). Remaining: OS-level key protection (BLK-D-07) | Node-side ceremony client + key store restart-safe (DONE); rotated-key/unknown-node rejection exercised end-to-end (DONE); rotation CLI DONE |
| BLK-D-06 | D-9 partition/offline policy | Reducer (`D-4C`) implements the enforcement state machine; **offline grant/lease policy IMPLEMENTED 2026-08-02** (`offline-policy.ts`: offlineEnabled grants, min(grant expiry, lease end, per-grant override), approval-required denial, policy/revocation lease freshness, consequential window, doc-default config; 15 tests). Remaining: wire the policy into the distributed PEP effect path and run node-level partition tests + reconnection reconciliation exercise | Partition tests match documented policy through the distributed PEP; TTL enforcement; reconnection reconciliation |
| BLK-D-07 | Operational deployment | no deployment topology/trust-bootstrap/monitoring procedures exercised | Deployment runbook + exercised topology |
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
| BLK-E-04 | E4 additional language SDK | **Rust foundation DONE 2026-08-02**: canonical serializer + verifier + request hashing with cross-language golden vector (TS ↔ Rust identical hash). Remaining: full Rust SDK surface | One additional SDK passing the same conformance suite (request-hash vector PASS; full surface pending) |
| BLK-E-05 | E5 external CLI adapters (Codex/Claude/Gemini) | **A1 launch scaffold DONE 2026-08-02** (`arcana launch <runtime>`: declaration, dry-run, supervision + evidence; no sandbox claim). **Hostile-escape fixtures runnable 2026-08-02** (`bounded-file-reader.test.ts`, 7 fixtures: traversal, absolute path, null byte, directory, size budget, junction escape). Remaining: OS-level containment engine integration + live Linux validation before any enforcement-level claim | Three adapters at declared levels; hostile escape fixtures for the declared boundary |
| BLK-E-06 | E6 framework adapters (Mastra/AI SDK/LangGraph/MCP apps) | **AI SDK-style + MCP hooks DONE 2026-08-02** (`governedTool` + `governedMcpTool`). **Mastra + LangGraph hooks DONE 2026-08-02** (`governedMastraTool` + `governedLangGraphTool`; 6 new tests, SDK suite 28/28). Remaining: live PEP transport integration | Framework tool calls map to canonical requests (DONE); PEP cannot be bypassed (hook-level DONE for AI SDK/MCP/Mastra/LangGraph, live transport pending) |
| BLK-E-07 | E7 adapter certification levels | **Registry published 2026-08-02** (`ADAPTER-CERTIFICATION.md`: A0–A3, procedure, nonclaims). Remaining: fixtures per adapter | Certification contract (DONE); per-adapter fixture results |
| BLK-E-08 | E8 developer experience and examples | Protocol quickstart published; reference apps + test-node/policy samples pending | DX package + security checklist |
| BLK-E-09 | E9 protocol governance and compatibility | PROTOCOL-GOVERNANCE published (lifecycle, deprecation, advisory, extensions, matrix); registry enforcement pending | Governance doc (DRAFT DONE) + registry enforcement |
| BLK-E-10 | E10 ecosystem evaluation and freeze | **Matrix published 2026-08-02** (`ECOSYSTEM-EVALUATION.md`: runtimes, languages, OSes, levels + freeze-gate status). **Certified adapter fixtures DONE 2026-08-02** (`src/v2/adapters/vectors.test.ts`: 4 frozen request-hash golden vectors — AI SDK/MCP/Mastra/LangGraph naming, pinned request identity; wired into `script/conformance.ts` as suite 5/5; `GovernanceContext` gained deterministic `requestId`/`nonce`/`requestedAt`). Remaining: live PEP transport, macOS/Linux validation, L3 | Matrix (DRAFT DONE); certified fixtures DONE; freeze pending live/L3 |

## Existing partial evidence

- `tools/acep-conformance-rust` — canonical node-identity + 46-vector conformance (2/2 tests).
- SCHEMA-VERSION-REGISTRY — schema version registry draft.
- `packages/sdk/js` — typed client and server spawner (7/7).
- 2026-08-02 market assessment — external adapter analysis.

## Phase F — Enterprise Control Plane

**Status: Service-core implementation HIGH — F1–F13 cores implemented
(`packages/core/src/enterprise/*`) and mounted on `/api/enterprise/*` + SDK
client; Production mounting SUBSTANTIAL; Secure production boundary BLOCKED
(BLK-F-AUTH-01 — enterprise mutations must bind actor/tenant identity to the
authenticated server context); Release readiness BLOCKED (operator consoles,
live exercises, F13 external assessment).**

## Open blockers

| ID | Task | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-F-01 | F1 multi-tenant organization model | **Tenant model + SQLite store IMPLEMENTED 2026-08-02** (all 10 entity kinds tenant-scoped; tenant-filtered queries; deletion isolation; 3 tests). Remaining: enterprise API mounting + retention policy doc | Tenant-isolation adversarial suite (core DONE; HTTP surface pending); deletion/retention documented |
| BLK-F-02 | F2 enterprise identity and access | **RBAC core DONE 2026-08-02** (tenant-scoped roles + permission matrix, privileged audit, immediate deprovisioning, time-bounded break-glass; 5 tests). Remaining: SSO/SCIM/MFA service integration, service accounts, separation-of-duties | Deprovisioning bound (0 ms core; SSO propagation pending); privileged actions audited (DONE); break-glass time-bounded (DONE) |
| BLK-F-03 | F3 central policy management | **Lifecycle DONE 2026-08-02** (D-4 signed store: validation-before-activation, staged rollout, transactional rollback, RunProof digest proof; F3: approved promotion + diff, 6 tests). **HTTP promotion/diff MOUNTED 2026-08-02** (`/api/enterprise/*/policies/*`: RBAC-checked promotion into per-environment target chains, structural diff; integration tested). **Draft validation IMPLEMENTED + MOUNTED 2026-08-02** (`policy-drafts.ts`: validate signed candidate against live chain without publishing — schema, signature, chain continuity; 2 core + 1 integration test). Remaining: simulation editor UI | Activation requires validation (DONE); rollback transactional (DONE); nodes prove policy digest (DONE via RunProof); authoring validation DONE; simulation editor pending |
| BLK-F-04 | F4 fleet and node operations | **Fleet core DONE 2026-08-02** (tenant inventory, health derivation, heartbeats, upgrade rings, backlog; 3 tests). **HTTP register/heartbeat/fleet-view/node-diagnostics MOUNTED 2026-08-02** (integration tested). **Upgrade-ring rollout IMPLEMENTED + MOUNTED 2026-08-02** (ring CRUD, node assignment, gated rollout plans; 3 core + 1 integration test) | Fleet view distinguishes unknown/healthy (DONE); stale nodes explicit (DONE); diagnostics DONE; rollout automation DONE (core) |
| BLK-F-05 | F5 central approval operations | **Central queue DONE 2026-08-02** (exact inspection, separation of duties, expiry, bulk deny only, emergency revocation; 4 tests; local PEP remains the execution authority). **Escalation core + HTTP MOUNTED 2026-08-02** (bounded fallback approvers, audited events, never consumes approvals; 4 core + 1 integration test). **Approvals list endpoint MOUNTED 2026-08-02** (`GET /api/enterprise/*/approvals` with status filter; integration tested). Remaining: escalation console mounting | Exact single-use approvals across network (core DONE); central UI cannot bypass local PEP (DONE by design); delegated approver authority bounded (DONE, tested) |
| BLK-F-06 | F6 audit/compliance/evidence archive | **Archive core DONE 2026-08-02** (immutable retention, fingerprint-verified export, custody chain, legal hold, tenant isolation; 4 tests; auditor read-only enforced via F2 RBAC). **HTTP archive/export/custody/legal-hold/retention-sweep MOUNTED 2026-08-02** (integration tested). **Compliance crosswalk PUBLISHED 2026-08-02** (PHASE-F-COMPLIANCE-CROSSWALK: SOC 2 / ISO 27001 / NIST mapping; certification explicitly not claimed) | Exported proof verifies independently (fingerprint DONE; SDK verifier available); auditor read-only tenant-scoped (DONE via RBAC); mappings DONE (engineering index; formal certification external) |
| BLK-F-07 | F7 HA/DR | **Core DONE 2026-08-02** (targets, digest-verified backup/restore, drill evaluation, degraded fail-closed; 3 tests). **HTTP backup/restore/drill MOUNTED 2026-08-02** (integration tested). Remaining: live multi-region DR exercise + key backup automation | Restore drills meet RPO/RTO (evaluator DONE; live exercise pending); fail-closed behavior matches policy (DONE) |
| BLK-F-08 | F8 federation | **Core DONE 2026-08-02** (agreements, authority intersection, conflict resolution, proof exchange, revocation propagation; 5 tests). **HTTP agreements/exchange/revocation/intersection MOUNTED 2026-08-02** (integration tested). **Cross-org approval routing IMPLEMENTED + MOUNTED 2026-08-02** (exact action grants, daily caps, agreement validity; 3 core + 1 integration test). **Federated revocation transport IMPLEMENTED + MOUNTED 2026-08-02** (`federation-transport.ts` + SQLite: outbox/inbox exchange, agreement-validated queue/receive, delivery state, dedup; 3 core + 1 integration test). Remaining: live network delivery + channel binding in ops deployment | Federation intersects authority (DONE); unknown issuer fails closed (DONE); delegated approver authority bounded (DONE, tested); revocation transport exchange DONE; live delivery pending (ops) |
| BLK-F-09 | F9 enterprise security operations | **Core DONE 2026-08-02** (alerts, incident timelines, audited revocation campaigns, forensic exports; 3 tests). **HTTP alerts/timeline/campaign/forensic MOUNTED 2026-08-02** (RBAC-checked; integration tested). **Anomaly detection IMPLEMENTED + MOUNTED 2026-08-02** (`anomaly.ts`: alert-burst/revocation-velocity/backlog/stale-ratio heuristics recorded through the alert pipeline; 3 core + 1 integration test). Remaining: compromise simulation (operator exercise) | Compromise simulation pending (operator exercise); emergency deny propagation (DONE, audited); anomaly heuristics DONE |
| BLK-F-10 | F10 data governance and privacy | **Core DONE 2026-08-02** (classification, regional/CMK constraints, PII export control + retention; 3 tests). **HTTP governance checks MOUNTED 2026-08-02** (storable/exportable/classify/PII-retention; integration tested). Remaining: regional-storage plumbing + CMK integration | Contracts documented (DONE); storage plumbing pending |
| BLK-F-11 | F11 enterprise API and automation | **Admin HTTP surface MOUNTED 2026-08-02** (`/api/enterprise/*`: F1-F12 cores mounted; 18 HTTP integration tests) + **admin-event store + SIEM CEF export MOUNTED 2026-08-02** (4 core + 1 integration test) + **ticketing payloads IMPLEMENTED + MOUNTED 2026-08-02** (`ticketing.ts`; 1 core + 1 integration test) + **webhook delivery sink IMPLEMENTED + MOUNTED 2026-08-02** (`webhooks.ts` + SQLite: endpoint registry, auto-enqueue on admin events, bounded retry/backoff, durable delivery state; 4 core + 1 integration test) + **SDK enterprise admin client (equivalent automation) DONE 2026-08-02** (`packages/sdk/js/src/v2/enterprise.ts`; 4 SDK tests). Remaining: live ticketing transport adapters + optional Terraform provider | Admin API + webhooks + automation tested (core HTTP surface DONE; SIEM export DONE; ticketing payloads DONE; webhook delivery DONE; equivalent automation DONE via SDK client; live ticketing adapters pending) |
| BLK-F-12 | F12 commercial readiness | **Core DONE 2026-08-02** (entitlements, metering-never-affects-security invariant, redacted diagnostics, upgrade policy; 4 tests). **Metering pipeline core + HTTP MOUNTED 2026-08-02** (usage aggregation, informational quota; 3 core + 1 integration test). **Usage export endpoint DONE 2026-08-02** (`GET /api/enterprise/*/commercial/usage/export`: per-feature totals; integration tested). Remaining: license text review + live telemetry ingestion from engine events | Metering never affects security decisions (DONE, tested); docs complete (DRAFT) |
| BLK-F-13 | F13 independent security assessment and GA freeze | **Freeze draft published 2026-08-02** (`docs/FREEZE-RELEASE.md` §Phase F: §40 gate evidence + operational gates). Remaining: authenticated-principal binding (BLK-F-AUTH-01), operator consoles, external architecture review, penetration test, threat-model review, supply-chain assessment, L3 reproduction, live exercises | Blockers resolved + milestone frozen (code, operational, and external gates) |
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
| BLK-1.0-02 | CLI 1.0 complete | no frozen JSON/exit-code contract; A1 launch scaffold exists, no production-certified adapter | CLI 1.0 milestone frozen |
| BLK-1.0-03 | one production-quality external adapter | A1 launch scaffold implemented (declaration, dry-run, supervision, evidence); no production-certified adapter | Adapter at declared certification level with hostile-escape fixture |
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
