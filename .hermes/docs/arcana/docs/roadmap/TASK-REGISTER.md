# Arcana Task Register (living)

**Document class:** living task register
**Authority:** secondary — status authority is `docs/STATUS.md`
**Created:** 2026-08-02 (Phase A–F completion audit)
**Update rule:** every session that touches a task must update its status,
evidence, and date in this register. New tasks are appended with `AUD-` IDs.

Status values: `COMPLETE` (evidence + freeze where required) · `PARTIAL`
(code/evidence exists, gaps remain) · `PENDING` (not started) · `BLOCKED`
(cannot progress without an external input) · `N/A`.

## Phase A — Epistemic Foundation

| Task | Weight | Status | Evidence | Blockers |
|---|---:|---|---|---|
| A1 Typed claim and evidence schemas | 10% | COMPLETE | `claim-store.ts`, schema tests | — |
| A2 Contracts, criteria, obligations | 15% | COMPLETE | `contract-engine.ts`, `obligation-engine.ts`, `contract-admission.ts` | — |
| A3 Append-only event store | 20% | COMPLETE | `event-store.ts`, concurrency/mutation suites | — |
| A4 Execution receipts/artifacts | 15% | COMPLETE | PEP receipts F-19, receipt-kind tests | — |
| A5 Hard completion gate | 20% | COMPLETE | `completion-verifier.ts`, idempotency tests | — |
| A6 Inspection commands | 10% | COMPLETE | `arcana epistemic proof inspect/verify/export`, replay commands | — |
| A7 Test/benchmark/document/freeze | 10% | COMPLETE | Phase B milestone, baselines, this register | — |

## Phase B — Verification and Replay

| Task | Weight | Status | Evidence | Blockers |
|---|---:|---|---|---|
| B1 RunProof schema | 15% | COMPLETE | `packages/arcana/src/proof/types.ts`, `run-proof.ts` | — |
| B2 Proof generation/verification | 15% | COMPLETE | `proof-manager.ts`, `proof-runtime.ts`, export tests | — |
| B3 Audit replay | 15% | COMPLETE | `audit-replay.ts` + tests | — |
| B4 Deterministic replay | 20% | COMPLETE | `deterministic-replay.ts`, replay matrix | — |
| B5 Live revalidation | 10% | COMPLETE | `live-revalidation.ts` + tests | — |
| B6 Trace health | 10% | COMPLETE | RunProof trace axes tests | — |
| B7 Performance and scalability | 5% | PARTIAL | derive p50 2.89–5.40 ms measured; re-measure at final commit | AUD-08 |
| B8 Documentation and freeze | 10% | COMPLETE | `PHASE-B-MILESTONE.md`, schema registry | — |

## Phase C — Local Governed Autonomy

| Task | Weight | Status | Evidence | Blockers |
|---|---:|---|---|---|
| C1 Canonical authorization requests | 5% | COMPLETE | `request-hash.ts`, `canonical-resource.ts` | — |
| C2 Durable capability grants | 10% | COMPLETE | `grant-store-sqlite.ts`, `session-grants.ts` | — |
| C3 Pure PDP | 10% | COMPLETE | `pdp.ts` + snapshot tests | — |
| C4 Effect-boundary PEP | 10% | COMPLETE | `pep.ts`, `effect-boundary.ts`, spy suites | — |
| C5 Intent-action binding | 8% | COMPLETE | `intent-binding*.ts`, `intent-runtime.ts` | — |
| C6 Provenance and sensitivity | 8% | COMPLETE | `labels.ts`, `field-lineage.ts` | — |
| C7 Scoped approvals | 8% | COMPLETE | `scoped-approval.ts` + lifecycle suites | — |
| C8 Delegated least privilege | 8% | COMPLETE | `delegation.ts`, `child-launch-barrier.ts` | — |
| C9 Workspace and MCP trust | 6% | COMPLETE | `trust-adapters.ts` + suites | — |
| C10 Security RunProof profiles | 5% | COMPLETE | profile derivation + trace health | — |
| C11 Adversarial evaluation | 12% | COMPLETE | 95 fixtures / 0 allows / 0 executor leaks | — |
| C12 Freeze and tag | 10% | COMPLETE | PHASE-C-MILESTONE, tags, sign-off 2026-08-01 | AUD-20 (L3) |

## TUI product track

| Task | Status | Evidence | Blockers |
|---|---|---|---|
| TUI-1.1 Runtime visibility | COMPLETE (historical tag) | `arcana-tui-1-governance-observability` | — |
| TUI-1.2 Interactive governance | COMPLETE (frozen) | `arcana-tui-2-interactive-authority-control` → `e0b14a2d` | — |
| TUI-1.3 Subagent/delegation console | PENDING | not implemented | — |
| TUI-1.4 Proof/replay/audit UI | PARTIAL | `proof-view/run-proof-view.ts`; full audit UI pending | — |
| TUI-1.5 Responsive Command Spine | PARTIAL | spine width logic + tests; matrix pending | BLK-TUI-02 |
| TUI-1.6 Stability/performance/accessibility | PARTIAL | 781/1/0 suite; live/performance gates pending | BLK-TUI-06, BLK-TUI-07 |
| TUI-1.7 Documentation and manual smoke plan | PARTIAL | runbook + smoke plan exist; execution pending | BLK-TUI-01 |
| TUI-2.1 production polish + freeze | PARTIAL | mounted, automated green; freeze NOT authorized | BLK-TUI-01..08 |
| TUI-3/4/5 (later milestones) | PENDING | out of TUI-2.1 scope | — |

## CLI 1.0 track

| Task | Status | Evidence | Blockers |
|---|---|---|---|
| Session/execution group | PARTIAL | `run`, `session list`, `serve`, history | BLK-CLI-02 |
| Policy/capability group | PARTIAL | `capability.ts`, approval CLI | BLK-CLI-02 |
| Proof/replay group | COMPLETE (not frozen) | 116/116 proof/CLI tests | BLK-CLI-02 |
| External-agent launch group | PENDING | no `launch codex/claude/gemini` | BLK-CLI-01 |
| Operations group | PARTIAL | doctor/trust/models/providers/daemon/gateway/cron | BLK-CLI-02/04 |
| JSON output + deterministic exit codes | PENDING | not frozen | BLK-CLI-02 |
| Shell completion | PENDING | not implemented | BLK-CLI-03 |
| Cross-platform smoke | PARTIAL | Windows only | BLK-CLI-04 |
| No CLI-only authorization bypass | PARTIAL | PEP-shared path; adversarial cross-surface suite pending | BLK-CLI-05 |

## Phase D — Distributed Governed Autonomy

| Task | Weight | Status | Evidence | Blockers |
|---|---:|---|---|---|
| D1 Node identity + enrollment | 10% | PARTIAL | envelope/contracts; ceremony/rotation pending | BLK-D-05 |
| D2 Signed short-lived grants | 15% | IMPLEMENTED (not frozen) | 7-layer verifier, 46 vectors, Rust conformance 2/2 | BLK-D-09 |
| D3 Mutual authentication | 10% | PARTIAL | D-6B sync control; production transport pending | BLK-D-01 |
| D4 Policy distribution/versioning | 10% | PARTIAL | digest chains in envelopes; signed bundles pending | BLK-D-01 |
| D5 Remote revocation | 15% | PARTIAL | envelopes + durable state + sync; convergence unmeasured | BLK-D-01 |
| D6 Distributed replay resistance | 10% | PARTIAL | reducers/durable state; duplicate-execution matrix pending | BLK-D-01 |
| D7 Proof synchronization | 10% | FROZEN (local) | `arcana-phase-d7-local-distributed-authority` → `017ad998` | BLK-D-02 (containment) |
| D-7.1 filesystem containment | — | PARTIAL | Linux `openat2 RESOLVE_BENEATH` scaffold + Windows handle final-path reader (`tools/fs-containment-rust`, 10/10 tests incl. traversal + junction escape, 2026-08-02); engine integration + live Linux validation pending | BLK-D-02 |
| D8 Cross-node proof composition | 10% | PARTIAL | D-8A batching (Merkle root + gap detection); **D-8B remote proof registration IMPLEMENTED 2026-08-02** — `proof-registration.ts` (schema/root/signature/enrollment/domain/chain/duplicate validation), `proof-registration-sqlite.ts` (durable ledger), HTTP `/api/proof/batches` + `/api/proof/nodes/:nodeId/reconcile`, 16 core tests + 2 HTTP tests; node-side uploader/outbox integration pending | BLK-D-04 |
| D9 Partition/offline policy | 5% | PENDING | design doc only | BLK-D-06 |
| D10 Adversarial evaluation + freeze | 5% | PENDING | — | BLK-D-08, BLK-D-09 |

## Phase E — Protocol, SDKs, External Adapters

| Task | Weight | Status | Evidence | Blockers |
|---|---:|---|---|---|
| E1 Freeze protocol specifications | 15% | PENDING | schema registry draft | BLK-E-01 |
| E2 Conformance test suite | 15% | PARTIAL | 46 internal vectors; not independent | BLK-E-02 |
| E3 TypeScript/JavaScript SDK 1.0 | 10% | PARTIAL | `packages/sdk/js` 7/7; SDK 1.0 surface missing | BLK-E-03 |
| E4 Additional language SDKs | 10% | PENDING | Rust scaffolding only | BLK-E-04 |
| E5 External CLI adapters | 15% | PENDING | none | BLK-E-05 |
| E6 Framework adapters | 10% | PENDING | none | BLK-E-06 |
| E7 Adapter certification levels | 5% | PENDING | A0–A3 described only | BLK-E-07 |
| E8 Developer experience/examples | 5% | PENDING | none | BLK-E-08 |
| E9 Protocol governance/compatibility | 5% | PENDING | none | BLK-E-09 |
| E10 Ecosystem evaluation + freeze | 10% | PENDING | none | BLK-E-10 |

## Phase F — Enterprise Control Plane and Federation

| Task | Weight | Status | Evidence | Blockers |
|---|---:|---|---|---|
| F1 Multi-tenant organization model | 8% | PENDING | enterprise scaffold only | BLK-F-01 |
| F2 Enterprise identity and access | 10% | PENDING | none | BLK-F-02 |
| F3 Central policy management | 10% | PENDING | none | BLK-F-03 |
| F4 Fleet and node operations | 10% | PENDING | none | BLK-F-04 |
| F5 Central approval operations | 8% | PENDING | none | BLK-F-05 |
| F6 Audit/compliance/evidence archive | 10% | PENDING | local proof export only | BLK-F-06 |
| F7 HA and disaster recovery | 10% | PENDING | none | BLK-F-07 |
| F8 Federation | 10% | PENDING | none | BLK-F-08 |
| F9 Enterprise security operations | 8% | PENDING | none | BLK-F-09 |
| F10 Data governance and privacy | 5% | PENDING | none | BLK-F-10 |
| F11 Enterprise API and automation | 4% | PENDING | HTTP API exists locally; admin surface pending | BLK-F-11 |
| F12 Commercial readiness | 4% | PENDING | license review pending | BLK-F-12 |
| F13 Independent assessment + GA freeze | 3% | PENDING | none | BLK-F-13 |

## Product tracks

| Track | Status | Evidence | Blockers |
|---|---|---|---|
| Node 1.0 | PARTIAL | D-7 frozen, D-8A done | BLK-D-01..09 |
| SDK 1.0 | PARTIAL | JS SDK basic client | BLK-E-02/03/04 |
| Control 1.0 | PENDING | enterprise scaffold | BLK-F-01..13 |
| Arcana Desktop | SPEC ONLY (not required for 1.0) | `docs/roadmap/DESKTOP-1.0-SPEC.md` | — |
| Arcana 1.0 convergence | NOT REACHED | — | BLK-1.0-01..05 |

## New tasks added during this audit (2026-08-02)

| ID | Task | Maps to | Owner |
|---|---|---|---|
| AUD-01 | Execute and record the 11-phase manual Windows Terminal smoke checklist at the exact final commit | BLK-TUI-01 | Operator + engineering |
| AUD-02 | Run the width matrix (59–180) and record results | BLK-TUI-02 | Engineering |
| AUD-03 | Run the dark/light theme matrix and record results | BLK-TUI-03 | Engineering |
| AUD-04 | Observe the approval lifecycle via spine keys (`v`/`a`/`d`) incl. inspector and prompt-conflict | BLK-TUI-04 | Operator + engineering |
| AUD-05 | Observe restart recovery and per-session approval isolation | BLK-TUI-05 | Operator + engineering |
| AUD-06 | Run the 6-checkpoint live-stream protocol (probe SSE) | BLK-TUI-06 | Engineering |
| AUD-07 | Measure TUI performance: input echo, session-open, first token, redundant requests, reconnect storms, idle traffic | BLK-TUI-07 | Engineering |
| AUD-08 | Rerun every suite at the exact committed checkpoint and record results; freeze tag pending sign-off | BLK-TUI-08 | Engineering |
| AUD-09 | Implement D-6B-T authenticated transport with MITM/wrong-audience/expired-credential fixtures | BLK-D-01 | Engineering |
| AUD-10 | Implement D-7.1 kernel containment: Linux `openat2 RESOLVE_BENEATH` + Windows handle final-path validation — Windows reader DONE (10/10); remaining: engine integration + live Linux validation | BLK-D-02 | Engineering |
| AUD-11 | Validate D-6A-L workload identity against a live Linux workload | BLK-D-03 | Engineering |
| AUD-12 | Implement D-8B remote proof registration with node/server hash reconciliation — control-plane ledger + HTTP surface DONE (16 core + 2 HTTP tests); remaining: node-side uploader/outbox, hostile-node matrix | BLK-D-04 | Engineering |
| AUD-13 | Implement node enrollment ceremony, durable key rotation, decommissioning | BLK-D-05 | Engineering |
| AUD-14 | Implement D-9 offline/partition policy with TTL and reconciliation | BLK-D-06 | Engineering |
| AUD-15 | Phase D ops deployment + hostile-node adversarial suite + Node 1.0 freeze | BLK-D-07/08/09 | Engineering |
| AUD-16 | Freeze protocol specs, build independent conformance harness, ship SDK 1.0 (JS) | BLK-E-01/02/03 | Engineering |
| AUD-17 | Build external CLI + framework adapters with declared certification levels | BLK-E-05/06/07 | Engineering |
| AUD-18 | Build the enterprise control plane F1–F13 with tenant isolation and federation | BLK-F-01..13 | Engineering |
| AUD-19 | Execute the Arcana 1.0 release flow: signed artifacts, installer, mainline promotion | BLK-1.0-04/05 | Release |
| AUD-20 | Obtain independent (L3+) reproduction of the Phase C evaluation | BLK-C/L3 | External |
| AUD-21 | Keep this register and `docs/STATUS.md` updated on every session touching a task | — | All agents |
| AUD-22 | Add per-task acceptance evidence links (commands + outputs) when each blocker closes | — | All agents |
