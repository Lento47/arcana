# Arcana Phase–Task Traceability

**Document class:** traceability matrix (task → evidence → gate)
**Authority:** secondary — normative gates in the master spec (Part II),
status authority `docs/STATUS.md`
**Created:** 2026-08-02 (Phase A–F completion audit)
**Audited commit:** `e57c5ca2` (2026-08-02 checkpoint commit; suites verified
on the pre-commit worktree, which the commit reproduces exactly)

This document traces every playbook phase and task to its implementation
evidence, its release gates, and its open blockers. It is the companion to
`docs/blockers/` (gap register) and `docs/roadmap/TASK-REGISTER.md` (living
task status).

Evidence legend:

```text
SRC   production source file
TST   test suite or file (with result)
TAG   git tag / frozen milestone
DOC   frozen documentation
OPS   operator-observed validation
MSR   measured performance value
```

---

## Phase A — Epistemic Foundation (COMPLETE / FROZEN)

Trace: `User objective → active contract → criteria/obligations → claims →
evidence references → events → completion evaluation`.

| Task | Evidence | Trace detail |
|---|---|---|
| A1 Typed claim/evidence schemas | SRC `packages/engine/src/session/epistemic/claim-store.ts`; TST claim/evidence suites | Stable IDs, status, evidence references to immutable events |
| A2 Contracts, criteria, obligations, revisions | SRC `contract-engine.ts`, `obligation-engine.ts`, `contract-admission.ts`; TST `contract-admission.test.ts`, `contract-engine.test.ts` | Revisions, supersession, deterministic status transitions |
| A3 Append-only event store | SRC `event-store.ts`; TST `event-hash.test.ts`, `event-store-concurrency.test.ts`, `event-store-multi-connection.test.ts`, `failure-injection.test.ts` | Hash chain, transactional sequences, mutation detection |
| A4 Execution receipts/artifacts | SRC PEP receipt emission; TST `receipt-kind.test.ts`, completion-gate suites | Tool receipts, before/after hashes, redaction |
| A5 Hard completion gate | SRC `completion-verifier.ts`; TST `completion-verifier.test.ts`, `completion-gate-idempotency.test.ts` | VerifiedComplete ⇒ criteria + obligations + evidence |
| A6 Inspection commands | SRC `packages/arcana/src/cli/run/*`, proof CLI; TST 116/116 CLI suite | inspect/verify/export/replay |
| A7 Freeze | DOC `PHASE-B-MILESTONE.md`, `docs/blockers/PHASE-A-BLOCKERS.md` | — |

Gates (playbook §8): all PASS — see `docs/blockers/PHASE-A-BLOCKERS.md`.

---

## Phase B — Verification and Replay (COMPLETE / FROZEN)

Trace: `RunProof axes → integrity → verification → reproducibility → trace
health → replay → live revalidation`.

| Task | Evidence | Trace detail |
|---|---|---|
| B1 RunProof schema | SRC `packages/arcana/src/proof/types.ts`, `run-proof.ts` | Versioned, canonicalizable, immutable |
| B2 Proof gen/verify | SRC `proof-manager.ts`, `proof-runtime.ts`; TST `run-proof.test.ts`, `run-proof-export.test.ts` | Model-independent verification |
| B3 Audit replay | SRC `audit-replay.ts`; TST `audit-replay.test.ts` | State reconstruction without effects |
| B4 Deterministic replay | SRC `deterministic-replay.ts`; TST `replay-fixture.test.ts`, `replay-matrix.test.ts` | Structured commands, digests, drift detection |
| B5 Live revalidation | SRC `live-revalidation.ts`; TST `live-revalidation.test.ts` | New linked result, history immutable |
| B6 Trace health | SRC RunProof projection; TST degraded-evidence cases | COMPLETE/DEGRADED/UNAVAILABLE semantics |
| B7 Performance | MSR derive p50 2.89–5.40 ms; audit replay < 500 ms (2026-08-01/02) | Re-measure at final commit (AUD-08) |
| B8 Freeze | TAG `arcana-epistemic-runtime-phase-b`; DOC milestone | — |

Gates (playbook §14): all PASS — see `docs/blockers/PHASE-B-BLOCKERS.md`.

---

## Phase C — Local Governed Autonomy (EVALUATION PASS + sign-off)

Trace: `canonical request → capability snapshot → pure PDP → fresh PEP →
atomic claim → exact effect → receipt → RunProof security profiles`.

| Task | Evidence | Trace detail |
|---|---|---|
| C1 Canonical requests | SRC `packages/core/src/capability/request-hash.ts`, `canonical-resource.ts` | Hash covers all consequential fields |
| C2 Durable grants | SRC `grant-store-sqlite.ts`, `session-grants.ts`; TST `grant-store*.test.ts`, `session-grants.test.ts` | Statuses, atomic use counters, restart |
| C3 Pure PDP | SRC `pdp.ts`; TST `pdp.test.ts` | Deterministic over immutable snapshot |
| C4 PEP | SRC `pep.ts`, `pep-integration.ts`, `effect-boundary.ts`; TST `pep.test.ts`, `production-enforcement.test.ts`, `resolve-execute-context.test.ts` | Freshness, atomic claim, exact-once |
| C5 Intent binding | SRC `intent-binding*.ts`, `intent-runtime.ts`; TST `intent-binding.test.ts`, `intent-runtime.test.ts`, `intent-binding-store-persistence.test.ts` | Session/contract-revision scoped |
| C6 Provenance/sensitivity | SRC `labels.ts`, `field-lineage.ts`; TST `labels.test.ts`, `information-flow.test.ts`, `field-lineage.test.ts` | Unknown lineage fails closed |
| C7 Scoped approvals | SRC `scoped-approval.ts`; TST `scoped-approval.test.ts`, `pep-use-claim.test.ts`, `atomic-use-replay.test.ts` | PENDING→APPROVED→CLAIMED→CONSUMED |
| C8 Delegation | SRC `delegation.ts`, `runtime-delegation.ts`, `child-launch-barrier.ts`; TST `delegation*.test.ts` | Attenuation + ancestor revocation |
| C9 Trust adapters | SRC `trust-adapters.ts`; TST `trust-adapters.test.ts` | Workspace/MCP identity + schema digest |
| C10 Security profiles | SRC RunProof profiles; TST profile/trace suites | Zeros meaningful only with COMPLETE trace |
| C11 Adversarial evaluation | TST 95 fixtures across 8 groups (wave 1–5 + gap closure); result 0 unexpected allows, 0 executor leaks | Frozen suite |
| C12 Freeze/tag | TAG `arcana-governed-autonomy-phase-c`, `phase-c-production-enforcement`; DOC `docs/security/PHASE-C-MILESTONE.md`; sign-off `docs/audits/ARCANA-SIGNOFF-2026-08-01.md` | Approve with exceptions |

Gates (playbook §19): all PASS within declared scope — see
`docs/blockers/PHASE-C-BLOCKERS.md`.

---

## TUI 1.0 track

| Milestone | Status | Evidence | Trace |
|---|---|---|---|
| TUI-1 governance visibility | COMPLETE (historical tag) | TAG `arcana-tui-1-governance-observability` | Not in current branch ancestry |
| TUI-2 interactive authority | COMPLETE (frozen) | TAG `arcana-tui-2-interactive-authority-control` → `e0b14a2d`; approval lifecycle sources | Approval pipeline mounted |
| TUI-2.1 production polish | PARTIAL — automated green, freeze NOT authorized | TST TUI 781/1/0; SRC spine polish, `approval-inspector.tsx`, daemon respawn; DOC `docs/tui/TUI-2.1-FREEZE-OPERATOR-RUNBOOK.md` | Runbook Gates 1–10 pending (BLK-TUI-01..08) |
| TUI-3 delegation console | PENDING | — | — |
| TUI-4 proof/replay/audit UI | PARTIAL | SRC `packages/tui/src/proof-view/run-proof-view.ts` | Full audit UI pending |
| TUI-5 final polish | PENDING | — | — |

Live manual observations already recorded (2026-08-02, see TUI-2.1 freeze
sign-off): startup, contract admission, governance aggregation, proof axes,
tool execution, gate-based approval, denial with zero effects, restart
durability. Missing: spine-key approval lifecycle, matrices, live-stream
protocol, performance.

---

## CLI 1.0 track

| Group | Status | Evidence |
|---|---|---|
| Session/execution | PARTIAL | `arcana run`, `session list`, `serve`, history |
| Policy/capability | PARTIAL | `arcana capability`, approval CLI paths |
| Proof/replay | PARTIAL (not frozen) | 116/116 tests incl. `proof inspect/verify/export`, `replay audit/deterministic`, `revalidate run` |
| External launch | PENDING | `arcana launch codex/claude/gemini` unimplemented (BLK-CLI-01) |
| Operations | PARTIAL | doctor/trust/models/providers/daemon/gateway/cron |
| JSON/exit codes/completion/cross-platform | PENDING | BLK-CLI-02/03/04 |

---

## Phase D — Distributed Governed Autonomy (ACTIVE, ~45–55%)

| Task | Status | Evidence | Blocker |
|---|---|---|---|
| D1 Node identity/enrollment | PARTIAL | identity contracts + core registry + HTTP `/api/nodes/*` + `arcana node enroll` CLI + identity file; D-8B registry integrated; optional rotate CLI pending | BLK-D-05 |
| D2 Signed short-lived grants | IMPLEMENTED | 7-layer verifier, 46 conformance vectors (41 negative), Rust conformance 2/2 | BLK-D-09 |
| D3 Mutual authentication | PARTIAL | D-6B sync control + **D-6B-T signed-envelope HTTP transport** (15 tests); TLS pending | BLK-D-01 |
| D4 Policy distribution | PARTIAL | signed bundle store (publish/staged/last-known-good/rollback, 11 tests) + HTTP policy endpoints + POLICY_SNAPSHOT/POLICY_DELTA/REVOCATION_DELTA via sync transport (4 core + 4 engine tests) + node-side delta validation (3 engine tests) + node runtime durable sync state (4 engine tests) + compatibility negotiation (2 client tests) | BLK-D-01 |
| D5 Remote revocation | PARTIAL | revocation store + convergence bounds + REVOCATION_SNAPSHOT/REVOCATION_DELTA delivery + emergency deny-list (node revoked, sync 401) + emergency push channel (SSE) + `arcana node key rotate` CLI | BLK-D-01 |
| D6 Replay resistance | PARTIAL | reducers + transport replay protection + **execution ledger + governed distributed PEP** (claim-before-effect, offline gating; 17 tests); hostile-node matrix pending | BLK-D-01 |
| D7 Proof sync | FROZEN (local) | TAG `arcana-phase-d7-local-distributed-authority` → `017ad998`; D-7.1 containment partial: Linux openat2 scaffold + Windows handle final-path reader (`tools/fs-containment-rust`, 10/10) + runnable hostile-escape fixture suite (`bounded-file-reader.test.ts`, 7/7) | BLK-D-02 |
| D8 Proof composition | PARTIAL | D-8A batching + **D-8B end-to-end** (control-plane + node side + CLI + local proof store integration, chained batches); ops/L3 outstanding | BLK-D-04 |
| D9 Offline/partition | PARTIAL | design doc + D-4C reducer + `offline-policy.ts` grant/lease policy (15 tests); PEP wiring + node-level partition tests pending | BLK-D-06 |
| D10 Adversarial eval/freeze | PARTIAL | hostile-node matrix: 15 fail-closed fixtures / 0 bypasses across all ten categories + revocation hostile suite: 9 fixtures / 0 bypasses (16 tests); Node 1.0 freeze pending | BLK-D-08/09 |

Architecture docs: `docs/architecture/phase-d/` (node-identity, signed-grants,
policy-synchronization, revocation-protocol, offline-enforcement,
protocol-state-machines, threat-model, implementation-roadmap).

Gates (playbook §31): NOT YET EVALUABLE — all distributed gates require the
BLK-D set to be closed first.

---

## Phase E — Protocol, SDKs, and External Adapters (PLANNED / PARTIAL)

| Task | Status | Evidence | Blocker |
|---|---|---|---|
| E1 Protocol freeze | PARTIAL | `PROTOCOL-1.0-SPEC.md` freeze draft + schema registry | BLK-E-01 |
| E2 Independent conformance | PARTIAL | TS + Rust independent implementations agree on 46 vectors (`script/conformance.ts` 3/3); L3 pending | BLK-E-02 |
| E3 JS/TS SDK 1.0 | PARTIAL | `@arcana/sdk/v2/governance|proof|errors` (17/17 SDK suite; conformance 4/4; compat contract) | BLK-E-03 |
| E4 Additional SDK | PARTIAL | Rust canonical serializer/verifier + request hashing with TS↔Rust golden vector (5 tests) | BLK-E-04 |
| E5 CLI adapters | PARTIAL | `arcana launch <runtime>` A1 scaffold (declaration, dry-run, evidence) | BLK-E-05 |
| E6 Framework adapters | PARTIAL | SDK governedTool + governedMcpTool + governedMastraTool + governedLangGraphTool hooks (11 tests) | BLK-E-06 |
| E7 Certification levels | PARTIAL | certification registry doc (A0–A3 + procedure + nonclaims) | BLK-E-07 |
| E8 DX/examples | PARTIAL | quickstart + enforcement-level guidance | BLK-E-08 |
| E9 Protocol governance | PARTIAL | governance doc draft (lifecycle/deprecation/advisory/extensions/matrix) | BLK-E-09 |
| E10 Ecosystem eval/freeze | PARTIAL | ecosystem evaluation matrix (runtimes/languages/OS/levels + gate status) + certified adapter request-hash vectors (4 golden hashes; conformance 5/5) | BLK-E-10 |

Partial evidence: `tools/acep-conformance-rust` (2/2), SDK client, schema
registry, market assessment.

---

## Phase F — Enterprise Control Plane and Federation (PLANNED / PARTIAL)

| Task | Status | Evidence | Blocker |
|---|---|---|---|
| F1 Multi-tenant model | PARTIAL | tenant model + SQLite store (tenant-scoped queries, deletion isolation, 3 tests) | BLK-F-01 |
| F2 Identity and access | PARTIAL | RBAC core: tenant-scoped roles/permissions, privileged audit, immediate deprovisioning, break-glass (5 tests) | BLK-F-02 |
| F3 Central policy | PARTIAL | D-4 signed store + F3 promotion/diff/approval lifecycle (6 tests) + draft validation without publishing (2 tests) + HTTP promotion/diff/validate-draft (RBAC; integration tested) | BLK-F-03 |
| F4 Fleet ops | PARTIAL | fleet inventory + health derivation + heartbeats + node diagnostics + upgrade-ring rollout (6 core tests) + HTTP register/heartbeat/view/diagnostics/rings/plan (integration tested) | BLK-F-04 |
| F5 Central approvals | PARTIAL | central queue: exact inspection, separation of duties, expiry, bulk deny, emergency revocation (4 tests) + escalation core (4 tests) + HTTP revoke/bulk-deny/escalation/approvals-list (RBAC; integration tested) | BLK-F-05 |
| F6 Audit/compliance archive | PARTIAL | immutable archive + fingerprint export + retention/legal-hold/custody (4 tests) + HTTP archive/export/custody/hold/sweep (integration tested) + compliance crosswalk doc (SOC2/ISO/NIST) | BLK-F-06 |
| F7 HA/DR | PARTIAL | targets + digest-verified restore + drill evaluation + degraded fail-closed (3 tests) + HTTP backup/restore/drill (integration tested) | BLK-F-07 |
| F8 Federation | PARTIAL | agreements + authority intersection + conflict resolution + proof exchange + revocation propagation (5 tests) + cross-org approval routing with bounded daily caps (3 tests) + revocation transport outbox/inbox (3 tests) + HTTP agreements/exchange/revocation/intersection/rules/route/outbox/inbox (integration tested) | BLK-F-08 |
| F9 Security operations | PARTIAL | alerts + incident timelines + audited campaigns + forensic exports (3 tests) + anomaly heuristics (3 tests) + HTTP alerts/timeline/campaign/forensic/anomaly-scan (RBAC; integration tested) | BLK-F-09 |
| F10 Data governance | PARTIAL | classification + regional/CMK + PII export/retention (3 tests) + HTTP governance checks (integration tested) | BLK-F-10 |
| F11 Enterprise API/automation | PARTIAL | `/api/enterprise/*` admin surface (F1-F12 cores mounted) + admin-event store + SIEM CEF export (4 core tests) + ticketing payloads (1 core test) + webhook delivery sink (4 core tests) + HTTP record/list/siem-export/ticketing/webhooks (18 HTTP integration tests + 2 event tests) + SDK enterprise admin client (4 SDK tests; equivalent automation) | BLK-F-11 |
| F12 Commercial readiness | PARTIAL | entitlements + metering-invariant + redacted diagnostics (4 tests) + metering pipeline (3 tests) + HTTP entitlement/metering/usage/quota/usage-export/diagnostics/upgrade (integration tested) | BLK-F-12 |
| F13 Assessment + GA freeze | PENDING | freeze draft with gate evidence; external assessment pending | BLK-F-13 |

---

## Cross-cutting traces

### Verification checkpoint (2026-08-02, working tree)

| Suite | Result |
|---|---|
| TUI | 781 pass / 1 skip / 0 fail (782) |
| Engine | 4251 pass / 74 skip / 1 todo / 0 fail (4326, 990.6 s) |
| Core | 1264 pass / 7 skip / 0 fail (1271) |
| Arcana CLI/proof | 116 pass / 0 fail |
| SDK JS | 7 pass / 0 fail |
| Rust conformance | 2 pass / 0 fail |
| Typecheck | 16/16 packages |
| Build | 8/8 tasks; engine binary smoke `0.0.0-phase-d-implementation-202608021350` |

### Release-gate bookkeeping

| Gate class | Verdict |
|---|---|
| Local unauthorized executions | 0 (Phase C frozen suite) |
| TUI/CLI authorization disagreements | not yet adversarially frozen (BLK-CLI-05) |
| Proof verification regressions | 0 (Phase B suites) |
| Installer/upgrade data loss | N/A — no signed release flow executed (BLK-1.0-04) |
| Known critical security defects | 0 known in scope; L3+ validation absent (AUD-20) |
| Benign local workflows | 100% of frozen release suite (Phase C 14/14) |
| Supported-platform smoke | Windows 100%; Linux/macOS pending (BLK-CLI-04) |

### Chain of authority (trace root)

```text
Master spec Parts I–IV (architecture/roadmap)
  → docs/STATUS.md (live status)
  → docs/blockers/ (gap register, this audit)
  → docs/roadmap/TASK-REGISTER.md (living task status)
  → docs/roadmap/PHASE-TRACEABILITY.md (this file)
  → docs/releases/COMPLETION-REPORT-2026-08-02.md (checkpoint completion summary)
```
