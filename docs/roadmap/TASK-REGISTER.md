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
| D1 Node identity + enrollment | 10% | PARTIAL | **Enrollment ceremony + key rotation IMPLEMENTED 2026-08-02**: core + HTTP endpoints + durable registry; **node side DONE**: `node-identity-file.ts` (restart-safe local identity store) + `arcana node enroll` CLI (join-token ceremony client); `arcana node status` reads identity + outbox. Remaining: key-rotation CLI (`arcana node key rotate` optional) | BLK-D-05 |
| D2 Signed short-lived grants | 15% | IMPLEMENTED (not frozen) | 7-layer verifier, 46 vectors, Rust conformance 2/2 | BLK-D-09 |
| D3 Mutual authentication | 10% | PARTIAL | **D-6B-T signed-envelope transport IMPLEMENTED 2026-08-02** (`sync-transport.ts`, `sync-replay-store-sqlite.ts`, HTTP `/api/sync/policy|revocation`, node `sync-client.ts`; Ed25519 request/response signing, nonce/expiry freshness, audience binding, replay idempotency + conflict detection, rotated-key rejection; 10 core + 5 engine tests). Remaining: TLS/mTLS encryption + channel binding (deployment blocker BLK-D-07) | BLK-D-01 |
| D4 Policy distribution/versioning | 10% | PARTIAL | **Signed policy bundle store IMPLEMENTED 2026-08-02** (`policy-bundle-store.ts` + SQLite): strict schema (unknown mandatory fields rejected), issuer-verified envelopes, sequence/previous-digest chaining, staged activation, last-known-good, explicit audited rollback (ROLLED_BACK + rollbackOf); HTTP `POST /api/policy/bundles`, `GET /api/policy/current`, `POST /api/policy/rollback`; **sync transport serves POLICY_SNAPSHOT/POLICY_DELTA** when a node is behind (11 core + 4 engine tests). **DELTA bundles IMPLEMENTED 2026-08-02** (`policy-delta.ts`; 4 core + 1 engine test). **Node-side delta validation DONE 2026-08-02** (`sync-client.ts`; 3 engine tests). **Node runtime persistence DONE 2026-08-02** (`sync-state.ts`; 4 engine tests). **Compatibility negotiation DONE 2026-08-02** (`compatibleFrom`/`compatibleTo` served on POLICY_SNAPSHOT/POLICY_DELTA; node client enforces against its supported version, missing range fails closed; 2 client tests + server assertions). Remaining: per-effect policy-snapshot recording already exists in RunProof | BLK-D-01 |
| D5 Remote revocation | 15% | PARTIAL | **Revocation store + convergence measurement + emergency deny-list IMPLEMENTED 2026-08-02**: sequence-monotonic statements, p50/p95 bounds, REVOCATION_SNAPSHOT/REVOCATION_DELTA sync delivery, `POST /api/revocations/emergency` (immediate NODE revocation + signed statement propagation; sync returns 401 for the denied node). **Emergency revocation push channel DONE 2026-08-02** (SSE `/api/sync/revocations/stream`). **`arcana node key rotate` CLI DONE 2026-08-02** (`rotatedIdentity` helper persists new key/epoch/certificate; 1 test). Remaining: none in-repo | BLK-D-01 |
| D6 Distributed replay resistance | 10% | PARTIAL | **Execution ledger IMPLEMENTED 2026-08-02** (`execution-ledger.ts` + SQLite + HTTP `/api/executions/*`; 7 core + 2 engine tests) **and wired into the distributed PEP** (`governed-distributed-pep.ts`: claim-before-effect, DUPLICATE never re-executes, CONFLICT/REPLAY_FORBIDDEN fail closed; 8 integration tests). Remaining: convergence measurement (D-5) and hostile-node matrix (D-10) | BLK-D-01 |
| D7 Proof synchronization | 10% | FROZEN (local) | `arcana-phase-d7-local-distributed-authority` → `017ad998` | BLK-D-02 (containment) |
| D-7.1 filesystem containment | — | PARTIAL | Linux `openat2 RESOLVE_BENEATH` scaffold + Windows handle final-path reader (`tools/fs-containment-rust`, 10/10 tests incl. traversal + junction escape, 2026-08-02); **hostile-escape fixtures runnable in the core suite 2026-08-02** (`bounded-file-reader.test.ts`, 7/7); engine integration + live Linux validation pending | BLK-D-02 |
| D8 Cross-node proof composition | 10% | PARTIAL | D-8A batching; **D-8B end-to-end IMPLEMENTED 2026-08-02**: control-plane ledger + HTTP, node-side uploader + outbox + HTTP client, **local proof store integration** (`local-proof-source.ts`: reads `.arcana/proofs/*.json`, deterministic ordering/hashes, chained multi-batch splitting) wired into `arcana node proof upload`; hostile-node matrix in D-10. Remaining: none in-repo (ops/TLS + L3 remain) | BLK-D-04 |
| D9 Partition/offline policy | 5% | PARTIAL | D-4C reducer (ONLINE → OFFLINE_RESTRICTED → OFFLINE_READ_ONLY → QUARANTINED) existed; **offline grant/lease policy IMPLEMENTED 2026-08-02** (`offline-policy.ts`: offlineEnabled grants, effective expiry = min(grant, lease, per-grant override), approval-required denial, policy/revocation lease freshness, consequential window, config defaults from design doc; 15 tests). Remaining: wire policy into distributed PEP + partition tests at node level | BLK-D-06 |
| D10 Adversarial evaluation + freeze | 5% | PARTIAL | **Hostile-node matrix IMPLEMENTED 2026-08-02** (`hostile-node-evaluation.test.ts`): 15 fail-closed fixtures across all ten playbook categories — forged grants, wrong audience, replay, clock skew (new future-issuedAt freshness check in `verifier.ts`), key rotation, delayed revocation, partition, duplicate execution, proof omission, node replacement/impersonation — 0 bypasses. **Revocation hostile suite ADDED 2026-08-02** (`revocation-hostile.test.ts`): 9 fail-closed fixtures — forged signature, unknown issuer, schema-invalid, future-dated (freshness check now covers envelopes without `expiresAt`), non-genesis first sequence, sequence rollback, duplicate-sequence content change, revoked-subject resurrection — 0 bypasses. Remaining: Node 1.0 API freeze + independent reproduction | BLK-D-08, BLK-D-09 |

## Phase E — Protocol, SDKs, External Adapters

| Task | Weight | Status | Evidence | Blockers |
|---|---:|---|---|---|
| E1 Freeze protocol specifications | 15% | PARTIAL | **PROTOCOL-1.0-SPEC.md published 2026-08-02** (freeze draft): canonical serialization, 7 signature domains, object registry, labels/lineage, reason-code registry, version negotiation, strict unknown-field rejection. Remaining: public release + external review | BLK-E-01 |
| E2 Conformance test suite | 15% | PARTIAL | **Runner + independent implementations DONE 2026-08-02**: `script/conformance.ts` runs TS golden crypto (100/100) + TS D-10 matrix (15/0) + **Rust independent verifier** (2/2, 46 vectors — TS generates, Rust verifies, no oracle sharing); suite doc `CONFORMANCE-SUITE.md`. Remaining: L3 external reproduction | BLK-E-02 |
| E3 TypeScript/JavaScript SDK 1.0 | 10% | PARTIAL | **Governance + proof + error model IMPLEMENTED 2026-08-02** (`@arcana/sdk/v2/governance|proof|errors`: canonical requests, adapter hook, envelope + RunProof verification, stable error codes; SDK suite 17/17; SDK conformance step wired into `script/conformance.ts` 4/4; `SDK-1.0-COMPATIBILITY.md` semver/error/conformance contract). Remaining: release freeze + conformance against external vectors | BLK-E-03 |
| E4 Additional language SDKs | 10% | PARTIAL | **Rust protocol SDK foundation IMPLEMENTED 2026-08-02** (`tools/acep-conformance-rust/src/request.rs`): canonical AuthorizationRequest encoding + domain-separated SHA-256 ported byte-for-byte from TypeScript, with a **cross-language golden vector** (same fixture hashes identically in TS and Rust: `b1e96acf…`); crate now 5 tests (3 request + 2 conformance). Remaining: full Rust SDK surface (envelopes, PEP client) | BLK-E-04 |
| E5 External CLI adapters | 15% | PARTIAL | **Launch scaffold IMPLEMENTED 2026-08-02** (`arcana launch codex|claude|gemini`): declared A1 level with explicit boundaries/bypasses, `--dry-run` declaration, process supervision + durable launch evidence record; NO sandbox claim (documented). Remaining: OS-level sandbox/interception for a real enforcement claim + hostile-escape fixtures | BLK-E-05 |
| E6 Framework adapters | 10% | PARTIAL | **AI SDK-style + MCP hooks IMPLEMENTED 2026-08-02** (`@arcana/sdk/v2/adapters`: `governedTool`, `governedMcpTool` — canonical requests, ALLOW-only execution, exact binding, MCP_DESCRIPTION default provenance). **Mastra + LangGraph hooks IMPLEMENTED 2026-08-02** (`governedMastraTool`, `governedLangGraphTool`; 6 new tests, SDK suite 28/28). Remaining: live PEP transport integration | BLK-E-06 |
| E7 Adapter certification levels | 5% | PARTIAL | `docs/protocol/ADAPTER-CERTIFICATION.md` published (A0–A3 contract, registry, procedure, nonclaims) | BLK-E-07 |
| E8 Developer experience/examples | 5% | PARTIAL | `docs/protocol/QUICKSTART.md` (authorize → executeExact → verify flow with enforcement-level guidance) | BLK-E-08 |
| E9 Protocol governance/compatibility | 5% | PARTIAL | `docs/protocol/PROTOCOL-GOVERNANCE.md` (version lifecycle, deprecation, security advisory, extension registry, compatibility matrix, ownership) | BLK-E-09 |
| E10 Ecosystem evaluation + freeze | 10% | PARTIAL | `docs/protocol/ECOSYSTEM-EVALUATION.md` published (runtime/language/OS/enforcement matrices + freeze-gate status with evidence). **Certified adapter fixtures DONE 2026-08-02** (`src/v2/adapters/vectors.test.ts`: 4 frozen request-hash golden vectors for AI SDK/MCP/Mastra/LangGraph naming with pinned request identity; conformance runner now 5/5; `GovernanceContext` supports deterministic `requestId`/`nonce`/`requestedAt`). Phase E freeze NOT authorized — live PEP transport + macOS/Linux + L3 pending | BLK-E-10 |

## Phase F — Enterprise Control Plane and Federation

| Task | Weight | Status | Evidence | Blockers |
|---|---:|---|---|---|
| F1 Multi-tenant organization model | 8% | PARTIAL | **Tenant model IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/tenant.ts` + SQLite): organizations, workspaces, environments, teams, users, service/agent principals, nodes, policy bundles, approval queues, proof archives — every record tenant-scoped, tenant-filtered queries (zero cross-tenant reads by construction), pure `withTenantAccess` guard, tenant deletion isolation, restart persistence (3 tests). Remaining: production mounting into enterprise APIs + retention policy doc | BLK-F-01 |
| F2 Enterprise identity and access | 10% | PARTIAL | **RBAC core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/identity.ts` + SQLite): tenant-scoped role assignments (OWNER/ADMIN/OPERATOR/AUDITOR/MEMBER), permission matrix, privileged-action audit (ALLOWED/DENIED), immediate deprovisioning (bound = 0), visible time-bounded break-glass with explicit end (5 tests). Remaining: SSO/SCIM/MFA service integration, service-account scopes, separation-of-duties workflows | BLK-F-02 |
| F3 Central policy management | 10% | PARTIAL | **Policy lifecycle IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/policy-lifecycle.ts`): validated cross-environment promotion (target re-validates signature + chain), explicit approver with policy.publish permission (audited ALLOWED/DENIED), structural bundle diff; builds on D-4 signed bundle store. **HTTP promotion/diff MOUNTED 2026-08-02** (RBAC-checked promotion into per-environment target chains; integration tested). **Draft validation IMPLEMENTED 2026-08-02** (`policy-drafts.ts`: signed-candidate validation against the live chain without publishing; 2 core tests) and MOUNTED (`validate-draft`; integration tested). Remaining: simulation editor UI | BLK-F-03 |
| F4 Fleet and node operations | 10% | PARTIAL | **Fleet core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/fleet.ts` + SQLite): tenant-scoped inventory with health derivation (UNKNOWN/HEALTHY/STALE/REVOKED/QUARANTINED), heartbeat updates, version/upgrade-ring/policy/revocation/proof-backlog state; stale/unreachable nodes explicit; upgrade failure cannot silently disable enforcement (3 tests). **HTTP register/heartbeat/fleet-view/node-diagnostics MOUNTED 2026-08-02** (`nodeDiagnostics` in core; integration tested). **Upgrade-ring rollout IMPLEMENTED 2026-08-02** (`upgrade-rings.ts` + SQLite: ring CRUD, node assignment, gated rollout plans — paused/revoked/quarantined deny; 3 core tests) and MOUNTED (rings/assign/plan endpoints; integration tested) | BLK-F-04 |
| F5 Central approval operations | 8% | PARTIAL | **Central approvals IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/approvals.ts` + SQLite): tenant-scoped queue, exact request inspection (mismatch fails closed), separation of requester/approver, expiry, bulk DENY only (no bulk approve API), emergency revocation of approved/unconsumed approvals (4 tests). **Escalation IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/escalation.ts` + SQLite): tenant escalation policies (maxWaitMs, bounded fallback approvers, break-glass flag), audited escalation events, advisory only — never changes approval status (4 core tests). **HTTP policy/check/events MOUNTED** + **approvals list endpoint (status filter) MOUNTED 2026-08-02** (`CentralApprovalStore.all`; integration tested). Remaining: escalation console mounting | BLK-F-05 |
| F6 Audit/compliance/evidence archive | 10% | PARTIAL | **Archive core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/audit-archive.ts` + SQLite): immutable tenant-scoped proof archive with canonical fingerprints (exports verify independently via the SDK verifier), chain-of-custody, retention policies with legal hold (deletion never falsifies surviving proofs), tenant isolation (4 tests). **HTTP archive/export/custody/legal-hold/retention-sweep MOUNTED 2026-08-02** (integration tested). **Compliance crosswalk PUBLISHED 2026-08-02** (`docs/compliance/PHASE-F-COMPLIANCE-CROSSWALK.md`; engineering index, certification not claimed). Remaining: auditor console | BLK-F-06 |
| F7 HA and disaster recovery | 10% | PARTIAL | **HA/DR core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/reliability.ts` + SQLite): availability/RPO/RTO config, digest-verified backup/restore (tamper → reject), restore drills evaluated against published targets, degraded-enforcement fail-closed behavior (3 tests). **HTTP backup/restore/drill MOUNTED 2026-08-02** (integration tested). Remaining: live multi-region/DR exercise + key backup/rotation automation | BLK-F-07 |
| F8 Federation | 10% | PARTIAL | **Federation core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/federation.ts` + SQLite): agreements with version/validity/status, authority intersection (never broadens), conflict resolution (ALLOW only if both), proof exchange preserving origin, revocation propagation under active agreements only (5 tests). **HTTP agreements/exchange/revocation/intersection MOUNTED 2026-08-02** (integration tested). **Cross-org approval routing IMPLEMENTED 2026-08-02** (`federation-approvals.ts` + SQLite: exact action grants, per-rule daily caps, agreement validity; 3 core tests) and MOUNTED (rules/route/routed endpoints; integration tested). **Federated revocation transport IMPLEMENTED 2026-08-02** (`federation-transport.ts` + SQLite: agreement-validated outbox/inbox, delivery state, dedup; 3 core tests) and MOUNTED (outbox/inbox/delivered endpoints; integration tested). Remaining: live network delivery + channel binding (ops) | BLK-F-08 |
| F9 Enterprise security operations | 8% | PARTIAL | **Security-ops core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/security-ops.ts` + SQLite): tenant-scoped alerts (severity-filtered), incident timelines, audited revocation campaigns (emergency deny propagation, per-node audit), forensic exports (3 tests). **HTTP alerts/timeline/campaign/forensic MOUNTED 2026-08-02** (RBAC-checked; integration tested). **Anomaly detection IMPLEMENTED 2026-08-02** (`anomaly.ts`: alert-burst / revocation-velocity / proof-backlog / stale-ratio heuristics recorded through the alert pipeline; 3 core tests) and MOUNTED (`anomaly-scan`; integration tested). Remaining: compromise simulation (operator exercise) | BLK-F-09 |
| F10 Data governance and privacy | 5% | PARTIAL | **Data governance core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/data-governance.ts`): classification (incl. PII), regional + CMK storage constraints, PII export control (telemetry opt-out), PII retention, input classification (3 tests). **HTTP governance checks MOUNTED 2026-08-02** (storable/exportable/classify/PII-retention; integration tested). Remaining: regional-storage plumbing + CMK integration | BLK-F-10 |
| F11 Enterprise API and automation | 4% | PARTIAL | **Admin HTTP surface MOUNTED 2026-08-02** (`/api/enterprise/*` in the engine server): all F1-F12 cores mounted (see PHASE-TRACEABILITY; 18 HTTP integration tests). **Admin-event store + SIEM CEF export IMPLEMENTED 2026-08-02** (`admin-events-sqlite.ts`, `siem-export.ts`: JSON-lines + ArcSight CEF with escaping; 4 core tests) and MOUNTED (record/list/siem-export endpoints; integration tested). **Ticketing payloads IMPLEMENTED 2026-08-02** (`ticketing.ts`: deterministic titles/priorities/labels per admin event; 1 core test) and MOUNTED (`ticketing/export`; integration tested). **Webhook delivery sink IMPLEMENTED 2026-08-02** (`webhooks.ts` + SQLite: endpoint registry, auto-enqueue on admin events, bounded retry/backoff, durable delivery state; 4 core tests) and MOUNTED (`webhooks`/`webhooks/deliveries`/`webhooks/deliver`; integration tested). **SDK enterprise admin client IMPLEMENTED 2026-08-02** (`packages/sdk/js/src/v2/enterprise.ts`: typed automation; injectable fetch; 4 SDK tests) — satisfies F11 "Terraform/provider or equivalent automation". Remaining: live ticketing transport adapters + optional Terraform provider | BLK-F-11 |
| F12 Commercial readiness | 4% | PARTIAL | **Core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/commercial-readiness.ts`): tiered entitlements (COMMUNITY/TEAM/ENTERPRISE), metering-never-affects-security invariant (explicit + tested), secret-redacted support diagnostics, upgrade policy (4 tests). **Metering pipeline IMPLEMENTED 2026-08-02** (`metering.ts` + SQLite: usage events, per-tenant/feature/window aggregation, informational quota status; 3 core tests) and MOUNTED (record/summary/quota endpoints; integration tested). **Usage export DONE 2026-08-02** (`GET /api/enterprise/*/commercial/usage/export`: per-feature totals; integration tested). Remaining: license text review + live telemetry ingestion from engine events | BLK-F-12 |
| F13 Independent assessment + GA freeze | 3% | PENDING | `docs/releases/PHASE-F-FREEZE-DRAFT.md` published (gate evidence + operational gates); freeze NOT authorized — external architecture review, penetration test, threat-model review, supply-chain assessment, L3 reproduction pending | BLK-F-13 |

## Product tracks

| Track | Status | Evidence | Blockers |
|---|---|---|---|
| Node 1.0 | PARTIAL | D-7 frozen, D-8A done; **API contract draft `docs/architecture/node-1.0-api-contract.md` (2026-08-02)**; release freeze NOT authorized — TLS (BLK-D-07), live Linux validation (BLK-D-03), local proof-store integration (BLK-D-04), independent reproduction pending | BLK-D-01..09 |
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
| AUD-09 | Implement D-6B-T authenticated transport with MITM/wrong-audience/expired-credential fixtures — signed-envelope transport DONE (10 core + 5 engine tests: forged signatures, wrong audience, expired credentials, replay conflict, rotated keys); remaining: TLS/mTLS + channel binding in ops deployment | BLK-D-01 | Engineering |
| AUD-10 | Implement D-7.1 kernel containment: Linux `openat2 RESOLVE_BENEATH` + Windows handle final-path validation — Windows reader DONE (10/10); remaining: engine integration + live Linux validation | BLK-D-02 | Engineering |
| AUD-11 | Validate D-6A-L workload identity against a live Linux workload | BLK-D-03 | Engineering |
| AUD-12 | Implement D-8B remote proof registration with node/server hash reconciliation — control-plane + node-side uploader/outbox + CLI + **local proof store integration** DONE (2 tests); remaining: ops/TLS + L3 | BLK-D-04 | Engineering |
| AUD-13 | Implement node enrollment ceremony, durable key rotation, decommissioning — control-plane core + HTTP endpoints DONE; node-side `arcana node enroll` CLI + identity file DONE | BLK-D-05 | Engineering |
| AUD-14 | Implement D-9 offline/partition policy with TTL and reconciliation — offline grant/lease policy DONE (15 tests); remaining: wire into distributed PEP, node-level partition tests, reconnection reconciliation exercise | BLK-D-06 | Engineering |
| AUD-15 | Phase D ops deployment + hostile-node adversarial suite + Node 1.0 freeze — hostile-node matrix DONE (15 fixtures, 0 bypasses); remaining: ops deployment (TLS/mTLS) + Node 1.0 freeze | BLK-D-07/08/09 | Engineering |
| AUD-23 | Wire the execution ledger claim-before-effect into the distributed PEP — DONE (`governed-distributed-pep.ts` composes offline policy + execution claims with PEP rechecks; 8 tests) | BLK-D-01/D-6 | Engineering |
| AUD-16 | Freeze protocol specs, build independent conformance harness, ship SDK 1.0 (JS) | BLK-E-01/02/03 | Engineering |
| AUD-17 | Build external CLI + framework adapters with declared certification levels | BLK-E-05/06/07 | Engineering |
| AUD-18 | Build the enterprise control plane F1–F13 with tenant isolation and federation | BLK-F-01..13 | Engineering |
| AUD-19 | Execute the Arcana 1.0 release flow: signed artifacts, installer, mainline promotion | BLK-1.0-04/05 | Release |
| AUD-20 | Obtain independent (L3+) reproduction of the Phase C evaluation | BLK-C/L3 | External |
| AUD-21 | Keep this register and `docs/STATUS.md` updated on every session touching a task | — | All agents |
| AUD-22 | Add per-task acceptance evidence links (commands + outputs) when each blocker closes | — | All agents |
| AUD-24 | Mount the enterprise admin HTTP surface (`/api/enterprise/*`: orgs, roles, fleet view, approvals with exact inspection, audit) — DONE (`b9d7e1e4`; 1 HTTP integration test) | BLK-F-01/02/04/05/11 | Engineering |
| AUD-25 | Mount the enterprise ops surface (F3 policy promotion/diff, F4 register/heartbeat, F5 revoke/bulk-deny, F6 archive/export/hold/sweep, F9 alerts/campaign/forensics, F10 governance checks) — DONE (`5e9b8633`; 5 HTTP integration tests) | BLK-F-03..06/09/10/11 | Engineering |
| AUD-26 | Mount F7 backup/restore/drill, F8 agreements/exchange/revocation/intersection, F12 entitlements/metering-invariant/diagnostics — DONE (`6f111ab5`; 3 HTTP integration tests) | BLK-F-07/08/11/12 | Engineering |
| AUD-27 | Implement and mount F4 node diagnostics, F5 escalation (bounded, advisory), F11 admin-event store + SIEM CEF export, F12 metering pipeline — DONE (`945897ee`; 11 core + 3 integration tests) | BLK-F-04/05/11/12 | Engineering |
| AUD-28 | Implement and mount F8 cross-org approval routing (exact grants, daily caps) + F4 upgrade-ring rollout + publish F6 compliance crosswalk — DONE (`a3db77e5`; 6 core + 2 integration tests) | BLK-F-04/06/08/11 | Engineering |
| AUD-29 | Ship the SDK enterprise admin client as F11 equivalent automation — DONE (`e0eba947`; 4 SDK tests) | BLK-F-11 | Engineering |
| AUD-30 | Implement and mount F3 policy draft validation, F9 anomaly-detection heuristics, F11 ticketing payloads — DONE (`aefd28f1`; 6 core + 3 integration tests) | BLK-F-03/09/11 | Engineering |
| AUD-31 | Implement and mount the F8 federated revocation transport exchange (outbox/inbox, delivery state, dedup) — DONE (3 core + 1 integration test); live network delivery + channel binding remain ops | BLK-F-08 | Engineering |
| AUD-32 | Implement and mount the F11 webhook delivery sink (endpoint registry, auto-enqueue on admin events, bounded retry/backoff, durable delivery state) — DONE (4 core + 1 integration test); live ticketing transport adapters + optional Terraform provider remain | BLK-F-11 | Engineering |
| AUD-33 | Add the F5 approvals list endpoint with status filtering (`CentralApprovalStore.all` + `GET /api/enterprise/*/approvals`) — DONE (integration tested) | BLK-F-05 | Engineering |
| AUD-34 | Add Mastra and LangGraph governed-tool adapters to the SDK (`governedMastraTool`, `governedLangGraphTool`) — DONE (6 SDK tests, suite 28/28); live PEP transport integration remains | BLK-E-06 | Engineering |
| AUD-35 | Convert the D-7.1 hostile-escape fixtures into a runnable core suite (`bounded-file-reader.test.ts`: traversal, absolute path, null byte, directory, size budget, junction escape) — DONE (7/7) | BLK-D-02/E-05 | Engineering |
| AUD-36 | Implement D-4 DELTA bundles and serve POLICY_DELTA/REVOCATION_DELTA from the sync control plane (`policy-delta.ts` + `sync-node.ts`) — DONE (4 core + 1 engine test); node-client compatibility negotiation remains | BLK-D-01/D-4 | Engineering |
| AUD-37 | Add the D-10 revocation hostile suite (`revocation-hostile.test.ts`: forged, unknown issuer, schema-invalid, future-dated, non-genesis, rollback, duplicate-content, resurrection — 9 fixtures, 0 bypasses) and extend the verifier freshness check to envelopes without `expiresAt` — DONE | BLK-D-05/D-08 | Engineering |
| AUD-38 | Add node-side sync-client delta validation (`sync-client.ts`: POLICY_DELTA base/sequence/result/target consistency, contiguous REVOCATION_DELTA statements) — DONE (3 new engine tests); node runtime local persistence of applied deltas remains | BLK-D-01/D-04 | Engineering |
| AUD-39 | Add node runtime durable sync state (`sync-state.ts`: persisted policy/revocation accepted state, snapshot/delta apply with idempotent retries and base-mismatch fail-closed; `arcana node sync` resumes from persisted state, `node status` displays it) — DONE (4 engine tests); node runtime `compatibleFrom`/`compatibleTo` consumption remains | BLK-D-01/D-04 | Engineering |
| AUD-40 | Implement D-4 compatibility negotiation (`compatibleFrom`/`compatibleTo` served on POLICY_SNAPSHOT/POLICY_DELTA; node client rejects out-of-range bundles and fails closed on a missing range) — DONE (2 client tests + server assertions) | BLK-D-01/D-04 | Engineering |
| AUD-41 | Add certified adapter request-hash vectors (`src/v2/adapters/vectors.test.ts`: 4 frozen golden hashes; deterministic `requestId`/`nonce`/`requestedAt` support in `GovernanceContext`; conformance runner suite 5/5) — DONE | BLK-E-10 | Engineering |
| AUD-42 | Implement the D-5 emergency revocation push channel (`GET /api/sync/revocations/stream` SSE: published statements pushed to per-directory subscribers, publish + emergency-deny broadcast, per-connection sequence) — DONE (1 integration test) | BLK-D-01/D-05 | Engineering |
| AUD-43 | Add the `arcana node key rotate` CLI (generate/accept new seed, call `POST /api/nodes/:nodeId/rotate`, persist rotated identity via `rotatedIdentity`) — DONE (1 test) | BLK-D-05 | Engineering |
| AUD-44 | Add the F12 usage export endpoint (`GET /api/enterprise/*/commercial/usage/export`: per-feature totals; integration tested) — DONE | BLK-F-12 | Engineering |
| AUD-45 | Fix TUI `v` inspect: approval inspection now works for ANY approval state (not only PENDING — `approvalInspectionAllowed` policy + regression tests) and non-approval rows fall back to the details view so the documented inspect key always produces feedback — DONE (TUI 784 tests, 0 fail) | TUI-2.1 | Engineering |
