# Arcana Task Register and Phase Traceability (consolidated)

**Document class:** living task register + traceability matrix
**Authority:** secondary — status decisions live in `docs/STATUS.md`
**Consolidated:** 2026-08-02 — merges the former `docs/roadmap/TASK-REGISTER.md` and `docs/roadmap/PHASE-TRACEABILITY.md`
**Implementation checkpoint:** `fb7c1968` (2026-08-21; current HEAD of `arcanagov`)
**Documentation reconciliation commit:** `882ea468` (baseline for the consolidated files)

Part 1 is the living per-task status register (playbook tasks plus AUD-xx campaign tasks). Part 2 is the task → evidence → gate traceability matrix.

## Task register

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
| TUI-1.6 Stability/performance/accessibility | PARTIAL | 786/1/0 suite; live/performance gates pending | BLK-TUI-06, BLK-TUI-07 |
| TUI-1.7 Documentation and manual smoke plan | PARTIAL | runbook + smoke plan exist; execution pending | BLK-TUI-01 |
| TUI-2.1 production polish + freeze | PARTIAL | mounted; 42 TUI failures in working-tree run; freeze NOT authorized | BLK-TUI-01..08 |
| TUI-3/4/5 (later milestones) | PENDING | out of TUI-2.1 scope | — |

## CLI 1.0 track

| Task | Status | Evidence | Blockers |
|---|---|---|---|
| Session/execution group | COMPLETE (not frozen) | `run`, `session list`, `serve`, history — `--json` + exit codes via PR #113 | BLK-CLI-02 |
| Policy/capability group | COMPLETE (not frozen) | `capability.ts`, approval CLI — `--json` + exit codes via PR #113 | BLK-CLI-02 |
| Proof/replay group | COMPLETE (not frozen) | 116/116 proof/CLI tests | BLK-CLI-02 |
| External-agent launch group | COMPLETE (not frozen) | All three adapters certified A1 (`arcana launch codex|claude|gemini`: declaration, `--dry-run`, supervision, durable evidence; no sandbox claim) — codex A1 2026-08-05, claude/gemini A1 via PR #118 | BLK-CLI-01 |
| Operations group | COMPLETE (not frozen) | doctor/trust/models/providers/daemon/gateway/cron — `--json` + exit codes via PR #113 | BLK-CLI-02/04 |
| JSON output + deterministic exit codes | COMPLETE (not frozen) | **`--json` + exit codes IMPLEMENTED 2026-08-05 (PR #65)**: `docs/cli-json-contract.md` + `packages/engine/src/cli/json-output.ts` + tests; session/node/trust converted. **Every-command coverage DONE 2026-08-09 (PR #113)**: engine CLI commands (capability, cron, daemon, doctor, gateway, history, models, providers, run, serve) + legacy arcana handlers; converted-commands table frozen; `json-contract.test.ts` 8/0. Remaining: CLI 1.0 milestone freeze | BLK-CLI-02 |
| Shell completion | COMPLETE | **bash/zsh/fish scripts + 8 tests (PR #67, merged 2026-08-05)**: `packages/arcana/src/cli/completion.ts` + `completion.test.ts` | - |
| Cross-platform smoke | PARTIAL | Windows executed: 10 checks, 10 pass, 0 fail at 5263b6fa (`script/platform-smoke.sh`, `docs/PLATFORM-SMOKE-MATRIX.md` published via PR #114); Linux/macOS NOT EXERCISED (no host; BLK-D-03 separate) | BLK-CLI-04 |
| No CLI-only authorization bypass | COMPLETE (not frozen) | PEP-shared path; frozen cross-surface adversarial suite `cross-surface-bypass.test.ts` — 18 fixtures, 18 pass / 0 fail, 0 bypasses (2026-08-05) | BLK-CLI-05 |

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
| D9 Partition/offline policy | 5% | PARTIAL | D-4C reducer (ONLINE → OFFLINE_RESTRICTED → OFFLINE_READ_ONLY → QUARANTINED) existed; **offline grant/lease policy IMPLEMENTED 2026-08-02** (`offline-policy.ts`: offlineEnabled grants, effective expiry = min(grant, lease, per-grant override), approval-required denial, policy/revocation lease freshness, consequential window, config defaults from design doc; 15 tests). **Wired into the distributed PEP + node-level partition suite 2026-08-05 (PR #63)** (`governed-distributed-pep.ts` D-9 offline gating; `offline-partition.test.ts`: partition, TTL, reconnection fixtures). Remaining: none in-repo | BLK-D-06 |
| D10 Adversarial evaluation + freeze | 5% | PARTIAL | **Hostile-node matrix IMPLEMENTED 2026-08-02** (`hostile-node-evaluation.test.ts`): 15 fail-closed fixtures across all ten playbook categories — forged grants, wrong audience, replay, clock skew (new future-issuedAt freshness check in `verifier.ts`), key rotation, delayed revocation, partition, duplicate execution, proof omission, node replacement/impersonation — 0 bypasses. **Revocation hostile suite ADDED 2026-08-02** (`revocation-hostile.test.ts`): 9 fail-closed fixtures — forged signature, unknown issuer, schema-invalid, future-dated (freshness check now covers envelopes without `expiresAt`), non-genesis first sequence, sequence rollback, duplicate-sequence content change, revoked-subject resurrection — 0 bypasses. Remaining: Node 1.0 API freeze + independent reproduction | BLK-D-08, BLK-D-09 |

## Phase E — Protocol, SDKs, External Adapters

| Task | Weight | Status | Evidence | Blockers |
|---|---:|---|---|---|
| E1 Freeze protocol specifications | 15% | PARTIAL | **PROTOCOL-1.0-SPEC.md published 2026-08-02** (freeze draft): canonical serialization, 7 signature domains, object registry, labels/lineage, reason-code registry, version negotiation, strict unknown-field rejection. Remaining: public release + external review | BLK-E-01 |
| E2 Conformance test suite | 15% | PARTIAL | **Runner + independent implementations DONE 2026-08-02**: `script/conformance.ts` runs TS golden crypto (100/100) + TS D-10 matrix (15/0) + **Rust independent verifier** (2/2, 46 vectors — TS generates, Rust verifies, no oracle sharing); suite doc `CONFORMANCE-SUITE.md`. Remaining: L3 external reproduction | BLK-E-02 |
| E3 TypeScript/JavaScript SDK 1.0 | 10% | PARTIAL | **Governance + proof + error model IMPLEMENTED 2026-08-02** (`@arcana/sdk/v2/governance|proof|errors`: canonical requests, adapter hook, envelope + RunProof verification, stable error codes; SDK suite 34/0 full `src`; SDK conformance step wired into `script/conformance.ts` 5/5; `SDK-1.0-COMPATIBILITY.md` semver/error/conformance contract). Remaining: release freeze + conformance against external vectors | BLK-E-03 |
| E4 Additional language SDKs | 10% | PARTIAL | **Rust protocol SDK foundation IMPLEMENTED 2026-08-02** (`tools/acep-conformance-rust/src/request.rs`): canonical AuthorizationRequest encoding + domain-separated SHA-256 ported byte-for-byte from TypeScript, with a **cross-language golden vector** (same fixture hashes identically in TS and Rust: `b1e96acf…`); crate now 5 tests (3 request + 2 conformance). **Envelopes + PEP decision client IMPLEMENTED 2026-08-05 (PR #64)** (`envelope.rs`: sign/verify with fixed keypairs; `pep.rs`). Remaining: full Rust SDK surface (proofs/verifier parity) | BLK-E-04 |
| E5 External CLI adapters | 15% | PARTIAL | **Launch scaffold IMPLEMENTED 2026-08-02** (`arcana launch codex|claude|gemini`): declared A1 level with explicit boundaries/bypasses, `--dry-run` declaration, process supervision + durable launch evidence record; NO sandbox claim (documented). Remaining: OS-level sandbox/interception for a real enforcement claim + hostile-escape fixtures | BLK-E-05 |
| E6 Framework adapters | 10% | PARTIAL | **AI SDK-style + MCP hooks IMPLEMENTED 2026-08-02** (`@arcana/sdk/v2/adapters`: `governedTool`, `governedMcpTool` — canonical requests, ALLOW-only execution, exact binding, MCP_DESCRIPTION default provenance). **Mastra + LangGraph hooks IMPLEMENTED 2026-08-02** (`governedMastraTool`, `governedLangGraphTool`; 6 new tests, SDK suite 28/28). Remaining: live PEP transport integration | BLK-E-06 |
| E7 Adapter certification levels | 5% | PARTIAL | ADAPTER-CERTIFICATION published (A0–A3 contract, registry, procedure, nonclaims) | BLK-E-07 |
| E8 Developer experience/examples | 5% | PARTIAL | Protocol quickstart (authorize → executeExact → verify flow with enforcement-level guidance) | BLK-E-08 |
| E9 Protocol governance/compatibility | 5% | COMPLETE (not frozen) | PROTOCOL-GOVERNANCE (version lifecycle, deprecation, security advisory, extension registry, compatibility matrix, ownership); **registry enforcement DONE (PR #120)**: validateExtensionRegistry + DEFAULT_EXTENSION_REGISTRY in `packages/core/src/protocol/extension-registry.ts` (with tests), wired into policy-bundle-store + verifier | BLK-E-09 |
| E10 Ecosystem evaluation + freeze | 10% | PARTIAL | ECOSYSTEM-EVALUATION published (runtime/language/OS/enforcement matrices + freeze-gate status with evidence). **Certified adapter fixtures DONE 2026-08-02** (`src/v2/adapters/vectors.test.ts`: 4 frozen request-hash golden vectors for AI SDK/MCP/Mastra/LangGraph naming with pinned request identity; conformance runner now 5/5; `GovernanceContext` supports deterministic `requestId`/`nonce`/`requestedAt`). Phase E freeze NOT authorized — live PEP transport + macOS/Linux + L3 pending | BLK-E-10 |

## Phase F — Enterprise Control Plane and Federation

| Task | Weight | Status | Evidence | Blockers |
|---|---:|---|---|---|
| F1 Multi-tenant organization model | 8% | PARTIAL | **Tenant model IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/tenant.ts` + SQLite): organizations, workspaces, environments, teams, users, service/agent principals, nodes, policy bundles, approval queues, proof archives — every record tenant-scoped, tenant-filtered queries (zero cross-tenant reads by construction), pure `withTenantAccess` guard, tenant deletion isolation, restart persistence (3 tests). **HTTP tenant-isolation adversarial suite DONE 2026-08-05 (PR #71)** (`packages/engine/test/server/httpapi-tenant-isolation.test.ts`) + **retention doc DONE** (`docs/architecture/tenant-retention.md`). Remaining: none in-repo | BLK-F-01 |
| F2 Enterprise identity and access | 10% | PARTIAL | **RBAC core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/identity.ts` + SQLite): tenant-scoped role assignments (OWNER/ADMIN/OPERATOR/AUDITOR/MEMBER), permission matrix, privileged-action audit (ALLOWED/DENIED), immediate deprovisioning (bound = 0), visible time-bounded break-glass with explicit end (5 tests). **Manager governance endpoint MOUNTED 2026-08-05 (PR #70)** (`GET /manager/governance`: read-only governance discovery + approval status; grants no authority). Remaining: SSO/SCIM/MFA service integration, service-account scopes, separation-of-duties workflows | BLK-F-02 |
| F3 Central policy management | 10% | PARTIAL | **Policy lifecycle IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/policy-lifecycle.ts`): validated cross-environment promotion (target re-validates signature + chain), explicit approver with policy.publish permission (audited ALLOWED/DENIED), structural bundle diff; builds on D-4 signed bundle store. **HTTP promotion/diff MOUNTED 2026-08-02** (RBAC-checked promotion into per-environment target chains; integration tested). **Draft validation IMPLEMENTED 2026-08-02** (`policy-drafts.ts`: signed-candidate validation against the live chain without publishing; 2 core tests) and MOUNTED (`validate-draft`; integration tested). Remaining: simulation editor UI | BLK-F-03 |
| F4 Fleet and node operations | 10% | PARTIAL | **Fleet core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/fleet.ts` + SQLite): tenant-scoped inventory with health derivation (UNKNOWN/HEALTHY/STALE/REVOKED/QUARANTINED), heartbeat updates, version/upgrade-ring/policy/revocation/proof-backlog state; stale/unreachable nodes explicit; upgrade failure cannot silently disable enforcement (3 tests). **HTTP register/heartbeat/fleet-view/node-diagnostics MOUNTED 2026-08-02** (`nodeDiagnostics` in core; integration tested). **Upgrade-ring rollout IMPLEMENTED 2026-08-02** (`upgrade-rings.ts` + SQLite: ring CRUD, node assignment, gated rollout plans — paused/revoked/quarantined deny; 3 core tests) and MOUNTED (rings/assign/plan endpoints; integration tested) | BLK-F-04 |
| F5 Central approval operations | 8% | PARTIAL | **Central approvals IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/approvals.ts` + SQLite): tenant-scoped queue, exact request inspection (mismatch fails closed), separation of requester/approver, expiry, bulk DENY only (no bulk approve API), emergency revocation of approved/unconsumed approvals (4 tests). **Escalation IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/escalation.ts` + SQLite): tenant escalation policies (maxWaitMs, bounded fallback approvers, break-glass flag), audited escalation events, advisory only — never changes approval status (4 core tests). **HTTP policy/check/events MOUNTED** + **approvals list endpoint (status filter) MOUNTED 2026-08-02** (`CentralApprovalStore.all`; integration tested). **Escalation console MOUNTED 2026-08-04 (PR #68)** (`packages/enterprise/src/routes/escalation.tsx`; 6 tests). **Console api proxy forwarding DONE 2026-08-12** (`e59f9fd6`; `packages/enterprise/src/core/enterprise-proxy.ts` + `src/api-app.ts`: `/api/enterprise/*` forwarded to the engine via `ARCANA_ENGINE_BASE_URL` default `http://localhost:4096`, fail closed 502/503 JSON; 12 tests). Remaining: none within console scope | BLK-F-05 |
| F6 Audit/compliance/evidence archive | 10% | PARTIAL | **Archive core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/audit-archive.ts` + SQLite): immutable tenant-scoped proof archive with canonical fingerprints (exports verify independently via the SDK verifier), chain-of-custody, retention policies with legal hold (deletion never falsifies surviving proofs), tenant isolation (4 tests). **HTTP archive/export/custody/legal-hold/retention-sweep MOUNTED 2026-08-02** (integration tested). **Compliance crosswalk PUBLISHED 2026-08-02** (PHASE-F-COMPLIANCE-CROSSWALK; engineering index, certification not claimed). **Auditor console MOUNTED 2026-08-04 (PR #69)** (`packages/enterprise/src/routes/auditor.tsx`; 11 helper tests). Remaining: none in-repo | BLK-F-06 |
| F7 HA and disaster recovery | 10% | PARTIAL | **HA/DR core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/reliability.ts` + SQLite): availability/RPO/RTO config, digest-verified backup/restore (tamper → reject), restore drills evaluated against published targets, degraded-enforcement fail-closed behavior (3 tests). **HTTP backup/restore/drill MOUNTED 2026-08-02** (integration tested). Remaining: live multi-region/DR exercise + key backup/rotation automation | BLK-F-07 |
| F8 Federation | 10% | PARTIAL | **Federation core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/federation.ts` + SQLite): agreements with version/validity/status, authority intersection (never broadens), conflict resolution (ALLOW only if both), proof exchange preserving origin, revocation propagation under active agreements only (5 tests). **HTTP agreements/exchange/revocation/intersection MOUNTED 2026-08-02** (integration tested). **Cross-org approval routing IMPLEMENTED 2026-08-02** (`federation-approvals.ts` + SQLite: exact action grants, per-rule daily caps, agreement validity; 3 core tests) and MOUNTED (rules/route/routed endpoints; integration tested). **Federated revocation transport IMPLEMENTED 2026-08-02** (`federation-transport.ts` + SQLite: agreement-validated outbox/inbox, delivery state, dedup; 3 core tests) and MOUNTED (outbox/inbox/delivered endpoints; integration tested). Remaining: live network delivery + channel binding (ops) | BLK-F-08 |
| F9 Enterprise security operations | 8% | PARTIAL | **Security-ops core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/security-ops.ts` + SQLite): tenant-scoped alerts (severity-filtered), incident timelines, audited revocation campaigns (emergency deny propagation, per-node audit), forensic exports (3 tests). **HTTP alerts/timeline/campaign/forensic MOUNTED 2026-08-02** (RBAC-checked; integration tested). **Anomaly detection IMPLEMENTED 2026-08-02** (`anomaly.ts`: alert-burst / revocation-velocity / proof-backlog / stale-ratio heuristics recorded through the alert pipeline; 3 core tests) and MOUNTED (`anomaly-scan`; integration tested). Remaining: compromise simulation (operator exercise) | BLK-F-09 |
| F10 Data governance and privacy | 5% | PARTIAL | **Data governance core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/data-governance.ts`): classification (incl. PII), regional + CMK storage constraints, PII export control (telemetry opt-out), PII retention, input classification (3 tests). **HTTP governance checks MOUNTED 2026-08-02** (storable/exportable/classify/PII-retention; integration tested). **Regional storage + CMK enforcement IMPLEMENTED 2026-08-05 (PR #66)** (`data-governance-store.ts`: region_data_classes + cmk_keys SQLite stores; PII requires encryption at rest). Remaining: real KMS/cloud provider integration | BLK-F-10 |
| F11 Enterprise API and automation | 4% | PARTIAL | **Admin HTTP surface MOUNTED 2026-08-02** (`/api/enterprise/*` in the engine server): all F1-F12 cores mounted (see Part 2 traceability; 18 HTTP integration tests). **Admin-event store + SIEM CEF export IMPLEMENTED 2026-08-02** (`admin-events-sqlite.ts`, `siem-export.ts`: JSON-lines + ArcSight CEF with escaping; 4 core tests) and MOUNTED (record/list/siem-export endpoints; integration tested). **Ticketing payloads IMPLEMENTED 2026-08-02** (`ticketing.ts`: deterministic titles/priorities/labels per admin event; 1 core test) and MOUNTED (`ticketing/export`; integration tested). **Webhook delivery sink IMPLEMENTED 2026-08-02** (`webhooks.ts` + SQLite: endpoint registry, auto-enqueue on admin events, bounded retry/backoff, durable delivery state; 4 core tests) and MOUNTED (`webhooks`/`webhooks/deliveries`/`webhooks/deliver`; integration tested). **SDK enterprise admin client IMPLEMENTED 2026-08-02** (`packages/sdk/js/src/v2/enterprise.ts`: typed automation; injectable fetch; 4 SDK tests) — satisfies F11 "Terraform/provider or equivalent automation". **Live ticketing transport adapters DONE 2026-08-05 (PR #73)** (TicketTransport interface + Jira adapter + webhook adapter; durable SQLite delivery, dedup, retry/backoff; 9 tests). Remaining: optional Terraform provider | BLK-F-11 |
| F12 Commercial readiness | 4% | PARTIAL | **Core IMPLEMENTED 2026-08-02** (`packages/core/src/enterprise/commercial-readiness.ts`): tiered entitlements (COMMUNITY/TEAM/ENTERPRISE), metering-never-affects-security invariant (explicit + tested), secret-redacted support diagnostics, upgrade policy (4 tests). **Metering pipeline IMPLEMENTED 2026-08-02** (`metering.ts` + SQLite: usage events, per-tenant/feature/window aggregation, informational quota status; 3 core tests) and MOUNTED (record/summary/quota endpoints; integration tested). **Usage export DONE 2026-08-02** (`GET /api/enterprise/*/commercial/usage/export`: per-feature totals; integration tested). **Telemetry ingestion from engine events DONE 2026-08-03** (`ea5b922f`). Remaining: license text review | BLK-F-12 |
| F13 Independent assessment + GA freeze | 3% | PENDING | `docs/FREEZE-RELEASE.md` published (gate evidence + operational gates); freeze NOT authorized — external architecture review, penetration test, threat-model review, supply-chain assessment, L3 reproduction pending | BLK-F-13 |

## Product tracks

| Track | Status | Evidence | Blockers |
|---|---|---|---|
| Node 1.0 | PARTIAL | D-7 frozen, D-8A done; **API contract draft node-1.0-api-contract (2026-08-02)**; release freeze NOT authorized — TLS (BLK-D-07), live Linux validation (BLK-D-03), local proof-store integration (BLK-D-04), independent reproduction pending | BLK-D-01..09 |
| SDK 1.0 | PARTIAL — governance, proof, errors, enterprise client and framework hooks implemented; release freeze, live PEP transport, full Rust surface and L3 validation pending | BLK-E-02/03/04/06, BLK-F-11 |
| Control 1.0 | PARTIAL — service cores and enterprise APIs substantially implemented; authenticated-principal binding (BLK-F-AUTH-01), operator consoles, production integrations, live exercises and external assessment pending | BLK-F-01..13 |
| Arcana Desktop | PARTIAL — local approval and forensic companion (M1, per ADR-004); runtime API + `/desktop/heartbeat` mounted; Desktop client implementation not yet built | Runtime API mounted (contracts/approval-api.v1.yaml) + ADR-004 M1 surface | — |
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
| AUD-10 | Implement D-7.1 kernel containment: Linux `openat2 RESOLVE_BENEATH` + Windows handle final-path validation — Windows reader DONE (10/10); **engine integration DONE 2026-08-03** (`cefd1426`: node proof-file reads in `packages/engine/src/node/local-proof-source.ts` routed through `SafeBoundedFileReader`; proof files escaping the workspace root or exceeding the byte budget fail closed and are skipped — 3 engine containment tests: contained read + symlink/junction-escape rejection + oversize rejection; existing 2 D-8B ordering/batch tests preserved, engine node suite 25/25, engine typecheck green); remaining: live Linux validation | BLK-D-02 | Engineering |
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
| AUD-32 | Implement and mount the F11 webhook delivery sink (endpoint registry, auto-enqueue on admin events, bounded retry/backoff, durable delivery state) — DONE (4 core + 1 integration test); live ticketing transport adapters DONE 2026-08-05 (PR #73); optional Terraform provider remains | BLK-F-11 | Engineering |
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
| AUD-45 | Fix TUI `v` inspect: approval inspection now works for ANY approval state (not only PENDING — `approvalInspectionAllowed` policy + regression tests); non-approval rows show a guidance toast (`o` is the details view) instead of opening the message-details dialog — DONE (TUI 784 tests, 0 fail) | TUI-2.1 | Engineering |
| AUD-46 | Fix TUI Esc behavior: Esc from the composer now ALWAYS leaves the composer to activate spine keys (j/k/v/a/d) — including during a busy turn — instead of falling through to session.interrupt and cancelling; interrupt remains explicit via the palette command — DONE (TUI 784 tests, 0 fail) | TUI-2.1 | Engineering |
| AUD-47 | Make Esc inert on ACTION GATES (permission/question/contract): an accidental Escape can no longer reject or decline a request; gates resolve explicitly with ←/→ + Enter (Reject keeps its confirmation stage where Esc cancels the rejection) — DONE (TUI 784 tests, 0 fail) | TUI-2.1 | Engineering |
| AUD-48 | Allow spine navigation (j/k) and `v` approval inspection while an ACTION GATE is open — the gate owns decisions (←/→ + Enter), but the operator can inspect the pending approval row before deciding; `a`/`d` remain gated until the gate resolves — DONE (TUI 785 tests, 0 fail) | TUI-2.1 | Engineering |
| AUD-49 | `v` on a permission-gate row (`permission:<id>`, e.g. the `01◤ approve` contract.accept row) now opens a read-only permission inspector (request ID, session, permission, patterns, tool message/call IDs, description) — DONE (TUI 787 tests, 0 fail) | TUI-2.1 | Engineering |
| AUD-50 | Document the D-7.1 OS-containment engine integration blocker with explicit owner/artifact/evidence (BLK-D-02 unblock requirements) — DONE | BLK-D-02 | Engineering |
| AUD-51 | Produce the CLI 1.0 contract freeze draft (`docs/FREEZE-RELEASE.md`: command catalog, JSON/NDJSON + exit-code proposal, launch protocol, gate evidence; NO self-sign-off) — DONE | BLK-CLI-01..05 | Engineering |
| AUD-52 | Produce the release-flow preparation plan (`docs/FREEZE-RELEASE.md`: verify → freeze/tag → build → sign → installer/update smoke → publish → mainline promotion → post-verify; owners/evidence; NOT executed) — DONE | BLK-1.0-04/05, AUD-19 | Release |
| AUD-53 | Full verification pass at the campaign checkpoint (core/engine/TUI/SDK/conformance/typechecks; totals recorded) — DONE | — | Engineering |
| AUD-54 | TUI-2.1 operator consoles (F3 simulation editor, F5 escalation console, F6 auditor console) — design proposed; **PENDING USER DECISION** (implementation requires approval) | TUI-2.1 | Engineering |
| AUD-55 | Live PEP transport (SDK adapter `authorize()` wired to an engine HTTP PEP endpoint) — design proposed; **PENDING USER DECISION** (implementation requires approval) | BLK-E-06/E-10 | Engineering |
| AUD-56 | Consolidate the external/human gate register with exact owner/artifact/evidence per gate (TLS, live Linux, live exercises, TUI matrices, F13, L3, license, Node freeze, Phase F freeze, Arcana 1.0 sign-off) — DONE (`docs/BLOCKERS.md`) | — | All owners |
| AUD-57 | Obtain the explicit human freeze sign-off for TUI-2.1 (required before the milestone tag) | TUI-2.1 | Maintainer + operator |
| AUD-58 | Create the immutable TUI-2.1 milestone tag at the verified exact final commit after human sign-off (release-flow Phase 1) | TUI-2.1 | Maintainer |
| AUD-59 | Implement independent goal completion verifier: deterministic gate (obligations, contract resolution, trace integrity, execution receipts) + bounded model verifier (temperature=0, no tools, Zod output schema, evidence ref validation) + goal state machine (complete_pending_verify, verified/rejected/error) + archive-on-verify + legacy state migration — WORKING TREE (2026-08-22) | BLK-GOAL-01 | Engineering |
| AUD-60 | Implement reserved memory keys: `isReservedMemoryKey()` filter rejecting `active.*`/`goal.*` roots at write time, FACTS.md/cloud sync/prompt/search/CLI merge filtering — WORKING TREE (2026-08-22) | BLK-GOAL-02 | Engineering |
| AUD-61 | Restore the full TUI and focused engine/core suites to green; the 42 TUI failures reproduce under pinned Bun 1.3.14 and Bun 1.4.0, so resolve or classify them as worktree/test-isolation regressions before exact-commit verification | BLK-TUI-08 | Engineering |

## Phase traceability

**Document class:** traceability matrix (task → evidence → gate)
**Authority:** secondary — normative gates in the master spec (Part II),
status authority `docs/STATUS.md`
**Created:** 2026-08-02 (Phase A–F completion audit)
**Audited commit:** `0392ad7b` (2026-08-02 checkpoint commit; suites verified
on the pre-commit worktree, which the commit reproduces exactly). Upstream
advanced to `63d71f07` (2026-08-03) via merged PRs #43–47; the checkpoint
below reflects the pre-advance audit. The TUI-2.1 freeze gates tracked by
`AUD-01..08` remain open at the new checkpoint, plus `AUD-57` (human freeze
sign-off) and `AUD-58` (immutable tag) added below.

This document traces every playbook phase and task to its implementation
evidence, its release gates, and its open blockers. It is the companion to
`docs/BLOCKERS.md` (gap register) and `docs/TASKS.md` (living
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
| A7 Freeze | DOC `PHASE-B-MILESTONE.md`, `docs/BLOCKERS.md` | — |

Gates (playbook §8): all PASS — see `docs/BLOCKERS.md`.

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

Gates (playbook §14): all PASS — see `docs/BLOCKERS.md`.

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
| C12 Freeze/tag | TAG `arcana-governed-autonomy-phase-c`, `phase-c-production-enforcement`; DOC PHASE-C-MILESTONE; sign-off ARCANA-SIGNOFF-2026-08-01 | Approve with exceptions |

Gates (playbook §19): all PASS within declared scope — see
`docs/BLOCKERS.md`.

---

## TUI 1.0 track

| Milestone | Status | Evidence | Trace |
|---|---|---|---|
| TUI-1 governance visibility | COMPLETE (historical tag) | TAG `arcana-tui-1-governance-observability` | Not in current branch ancestry |
| TUI-2 interactive authority | COMPLETE (frozen) | TAG `arcana-tui-2-interactive-authority-control` → `e0b14a2d`; approval lifecycle sources | Approval pipeline mounted |
| TUI-2.1 production polish | PARTIAL — mounted; 42 TUI failures in working-tree run; freeze NOT authorized | TST TUI 1132/1/42 (working tree); historical TUI 786/1/0; SRC spine polish, `approval-inspector.tsx`, daemon respawn; DOC TUI-2.1-FREEZE-OPERATOR-RUNBOOK | Runbook Gates 1–10 pending (BLK-TUI-01..08) |
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
| Session/execution | COMPLETE (not frozen) | `arcana run`, `session list`, `serve`, history — `--json` + exit codes via PR #113 |
| Policy/capability | COMPLETE (not frozen) | `arcana capability`, approval CLI paths — `--json` + exit codes via PR #113 |
| Proof/replay | COMPLETE (not frozen) | 116/116 tests incl. `proof inspect/verify/export`, `replay audit/deterministic`, `revalidate run` |
| External launch | COMPLETE (not frozen) | `arcana launch <runtime>` all three adapters certified A1 (declaration, `--dry-run`, supervision, evidence; no sandbox claim) — codex A1 2026-08-05, claude/gemini A1 via PR #118 (BLK-CLI-01) |
| Operations | COMPLETE (not frozen) | doctor/trust/models/providers/daemon/gateway/cron — `--json` + exit codes via PR #113 |
| JSON/exit codes/completion/cross-platform | COMPLETE (not frozen) | **BLK-CLI-02 merged (PR #65)**: `docs/cli-json-contract.md` + `--json` for session/node/trust; **every-command coverage via PR #113**; **BLK-CLI-03 merged (PR #67)**: bash/zsh/fish completion; **BLK-CLI-04 matrix published (PR #114)** (`docs/PLATFORM-SMOKE-MATRIX.md`, `script/platform-smoke.sh`, Windows 10/10); remaining: CLI 1.0 contract freeze |

---

## Phase D — Distributed Governed Autonomy (implementation coverage HIGH; release readiness BLOCKED)

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
| D9 Offline/partition | PARTIAL | design doc + D-4C reducer + `offline-policy.ts` grant/lease policy (15 tests) + **distributed PEP offline gating + node-level partition/TTL/reconnection suite (PR #63, 2026-08-05)**; remaining: none in-repo | BLK-D-06 |
| D10 Adversarial eval/freeze | PARTIAL | hostile-node matrix: 15 fail-closed fixtures / 0 bypasses across all ten categories + revocation hostile suite: 9 fixtures / 0 bypasses (16 tests); Node 1.0 freeze pending | BLK-D-08/09 |

Architecture docs: `.hermes/docs/arcana/docs/architecture/phase-d/`
(node-identity, signed-grants, policy-synchronization, revocation-protocol,
offline-enforcement, protocol-state-machines, threat-model,
implementation-roadmap).

Gates (playbook §31): NOT YET EVALUABLE — all distributed gates require the
BLK-D set to be closed first.

---

## Phase E — Protocol, SDKs, and External Adapters (PARTIAL — implementation MODERATE–HIGH; release BLOCKED)

| Task | Status | Evidence | Blocker |
|---|---|---|---|
| E1 Protocol freeze | PARTIAL | `PROTOCOL-1.0-SPEC.md` freeze draft + schema registry | BLK-E-01 |
| E2 Independent conformance | PARTIAL | TS + Rust independent implementations agree on 46 vectors (`script/conformance.ts` 5/5 suites incl. D-10 + adapter + SDK surface); L3 pending | BLK-E-02 |
| E3 JS/TS SDK 1.0 | PARTIAL | `@arcana/sdk/v2/governance|proof|errors` (SDK suite 34/0 full `src`; conformance 5/5; compat contract) | BLK-E-03 |
| E4 Additional SDK | PARTIAL | Rust canonical serializer/verifier + request hashing with TS↔Rust golden vector + envelopes + PEP decision client (PR #64, 2026-08-05) | BLK-E-04 |
| E5 CLI adapters | PARTIAL | `arcana launch <runtime>` A1 scaffold (declaration, dry-run, evidence) | BLK-E-05 |
| E6 Framework adapters | PARTIAL | SDK governedTool + governedMcpTool + governedMastraTool + governedLangGraphTool hooks (11 tests) | BLK-E-06 |
| E7 Certification levels | PARTIAL | certification registry doc (A0–A3 + procedure + nonclaims) | BLK-E-07 |
| E8 DX/examples | PARTIAL | quickstart + enforcement-level guidance | BLK-E-08 |
| E9 Protocol governance | COMPLETE (not frozen) | PROTOCOL-GOVERNANCE (lifecycle/deprecation/advisory/extensions/matrix); **registry enforcement DONE (PR #120)**: validateExtensionRegistry + DEFAULT_EXTENSION_REGISTRY in `packages/core/src/protocol/extension-registry.ts` (with tests), wired into policy-bundle-store + verifier | BLK-E-09 |
| E10 Ecosystem eval/freeze | PARTIAL | ecosystem evaluation matrix (runtimes/languages/OS/levels + gate status) + certified adapter request-hash vectors (4 golden hashes; conformance 5/5) | BLK-E-10 |

Partial evidence: `tools/acep-conformance-rust` (2/2), SDK client, schema
registry, market assessment.

---

## Phase F — Enterprise Control Plane and Federation (PARTIAL — service cores HIGH; production boundary BLOCKED by BLK-F-AUTH-01)

| Task | Status | Evidence | Blocker |
|---|---|---|---|
| F1 Multi-tenant model | PARTIAL | tenant model + SQLite store (tenant-scoped queries, deletion isolation, 3 tests) + HTTP tenant-isolation adversarial suite + retention doc (PR #71) | BLK-F-01 |
| F2 Identity and access | PARTIAL | RBAC core: tenant-scoped roles/permissions, privileged audit, immediate deprovisioning, break-glass (5 tests) + manager governance endpoint (PR #70) | BLK-F-02 |
| F3 Central policy | PARTIAL | D-4 signed store + F3 promotion/diff/approval lifecycle (6 tests) + draft validation without publishing (2 tests) + HTTP promotion/diff/validate-draft (RBAC; integration tested) | BLK-F-03 |
| F4 Fleet ops | PARTIAL | fleet inventory + health derivation + heartbeats + node diagnostics + upgrade-ring rollout (6 core tests) + HTTP register/heartbeat/view/diagnostics/rings/plan (integration tested) | BLK-F-04 |
| F5 Central approvals | PARTIAL | central queue: exact inspection, separation of duties, expiry, bulk deny, emergency revocation (4 tests) + escalation core (4 tests) + HTTP revoke/bulk-deny/escalation/approvals-list (RBAC; integration tested) + escalation console (PR #68) + console api proxy forwarding (`e59f9fd6`; 12 tests) | BLK-F-05 |
| F6 Audit/compliance archive | PARTIAL | immutable archive + fingerprint export + retention/legal-hold/custody (4 tests) + HTTP archive/export/custody/hold/sweep (integration tested) + compliance crosswalk doc (SOC2/ISO/NIST) + auditor console (PR #69) | BLK-F-06 |
| F7 HA/DR | PARTIAL | targets + digest-verified restore + drill evaluation + degraded fail-closed (3 tests) + HTTP backup/restore/drill (integration tested) + key backup/rotation automation (`99b0ddf0`: dry-run/confirmed rotation on the D-1 registry, tenant-scoped evidence, fingerprint-gated restore; 6 core + 3 engine tests) | BLK-F-07 |
| F8 Federation | PARTIAL | agreements + authority intersection + conflict resolution + proof exchange + revocation propagation (5 tests) + cross-org approval routing with bounded daily caps (3 tests) + revocation transport outbox/inbox (3 tests) + HTTP agreements/exchange/revocation/intersection/rules/route/outbox/inbox (integration tested) | BLK-F-08 |
| F9 Security operations | PARTIAL | alerts + incident timelines + audited campaigns + forensic exports (3 tests) + anomaly heuristics (3 tests) + HTTP alerts/timeline/campaign/forensic/anomaly-scan (RBAC; integration tested) | BLK-F-09 |
| F10 Data governance | PARTIAL | classification + regional/CMK + PII export/retention (3 tests) + HTTP governance checks (integration tested) + regional storage/CMK enforcement (PR #66) | BLK-F-10 |
| F11 Enterprise API/automation | PARTIAL | `/api/enterprise/*` admin surface (F1-F12 cores mounted) + admin-event store + SIEM CEF export (4 core tests) + ticketing payloads (1 core test) + webhook delivery sink (4 core tests) + HTTP record/list/siem-export/ticketing/webhooks (18 HTTP integration tests + 2 event tests) + SDK enterprise admin client (4 SDK tests; equivalent automation) | BLK-F-11 |
| F12 Commercial readiness | PARTIAL | entitlements + metering-invariant + redacted diagnostics (4 tests) + metering pipeline (3 tests) + HTTP entitlement/metering/usage/quota/usage-export/diagnostics/upgrade (integration tested); telemetry ingestion DONE (PR #72) | BLK-F-12 |
| F13 Assessment + GA freeze | PENDING | freeze draft with gate evidence; auth boundary resolved (PR #53); escalation + auditor consoles mounted (F5/F6); external assessment + remaining operator console work pending | BLK-F-13 |
| F-AUTH Admin identity boundary | BLOCKED | BLK-F-AUTH-01: enterprise mutations must derive actor/tenant identity from authenticated server context; body actor fields (`actorUserId`/`approvedBy`/`tenantId`) must not establish authority or audit attribution; cross-tenant impersonation + forged-approver fixtures fail closed; audit records use the authenticated principal | BLK-F-AUTH-01 |

---

## Cross-cutting traces

### Verification checkpoint (canonical: implementation checkpoint `0392ad7b`)

| Suite | Result |
|---|---|
| TUI | 786 pass / 1 skip / 0 fail (787) |
| Engine | 4305 pass / 1 todo / 4 fail under the default 5s per-test timeout (4384 tests) — timing-bound, pass with `--timeout 30000` or in isolation; NOT a clean suite |
| Core | 1465 pass / 7 skip / 0 fail (1472 tests, 175 files) |
| Arcana CLI/proof | 116 pass / 0 fail |
| SDK JS | 34 pass / 0 fail (full `src` run) |
| Rust conformance | 2 pass / 0 fail |
| Conformance runner | 5/5 suites (46 crypto + 4 adapter vectors + 15 hostile fixtures + Rust verifier + SDK surface) |
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
  → docs/BLOCKERS.md (gap register, this audit)
  → docs/TASKS.md (living task status)
  → docs/TASKS.md (this file)
  → docs/COMPLETION-REPORT.md (checkpoint completion summary)
```

## AUD-2x: Runtime approval routing and engine stability closure (2026-08-03)

| Task | Status | Evidence | Blockers |
|---|---|---|---|
| AUD-21 Engine stability closure: classify and fix the 33 full-suite failures | COMPLETE | Baseline rerun 2026-08-02: 4250 pass / 33 fail. Classification: 30 subprocess harness failures (bun not on PATH; fixed with process.execPath in test/lib/cli-process.ts), 2 replay fixtures (PATH bootstrap + explicit execSync env), 1 Windows shell test (Git Bash cygpath root assumption; test now asserts cross-variant normalization). Repro runs: all pass with bun removed from PATH | - |
| AUD-22 Load-bound snapshot/revert test timeouts + stability gate | COMPLETE | Justified per-test timeouts (15s revert/compact restore, 10s snapshot) with comments; test:engine:stability rewritten as fresh-process iterations (script/stability-run.ts); 3/3 clean; concurrency 1/4/8, randomize, seeded randomize all 0 fail | - |
| AUD-23 Approval routing model + REVOKE lifecycle | COMPLETE | approval-routing.ts (LOCAL_TUI/DESKTOP_PREFERRED/DESKTOP_REQUIRED/CENTRAL_REQUIRED, policy-driven); REVOKE (PENDING/APPROVED -> INVALIDATED, zero execution path); surface-bound routing gate in approval/command.ts; 17 core routing/lifecycle tests + 15 engine gate tests | - |
| AUD-24 Runtime/Desktop API contract | COMPLETE (pre-release) | Runtime API mounted (/approvals, approve/deny/revoke, /sessions, /proofs, /desktop/heartbeat); operator identity from server context; exact-request revalidation; OpenAPI contracts/approval-api.v1.yaml; doc docs/RUNTIME-API-CONTRACT.md; 19 engine approval tests | Desktop client implementation not yet built; the runtime surface it consumes is mounted (ADR-004 M1 local approval companion) |
| AUD-25 Low-noise TUI governance projection | COMPLETE | Three visibility modes (conversation default / operations / forensic); healthy governance aggregated into compact lifecycle rows; forensic expands raw evidence; security-critical rows always visible; 18 TUI tests | - |

## AUD-3x: Performance audit (2026-08-20)

Comprehensive memory, CPU, and database performance audit. Full results in `docs/STATUS.md` Performance audit section.

| Task | Status | Evidence | Blockers |
|---|---|---|---|
| AUD-31 Fix unbounded caches (`fileCache`, `validatorCache`, `lazy-loader`) | COMPLETE | `config.ts:46`, `validate.ts:4`, `lazy-loader.ts:1` | — |
| AUD-32 Replace unbounded PubSub/Queue with bounded | COMPLETE | `event.ts:185,198`, `native-runtime.ts:107` | — |
| AUD-33 Fix event listener leaks in TUI | COMPLETE | `project.tsx:70`, `session/index.tsx:621,673,698,712` | — |
| AUD-34 Fix N+1 query in ClaimStore | COMPLETE | `claim-store.ts:74-84` | — |
| AUD-35 Add pagination to unbounded queries | COMPLETE | `stats.ts:85`, `fence.ts:15`, `project.tsx:366` | — |
| AUD-36 Limit concurrency to reasonable values | COMPLETE | 39 instances bounded to 2-16 | — |
| AUD-37 Fix O(n²) path deduplication | COMPLETE | `spine-mapper.ts:2129` | — |
| AUD-38 Add eviction to in-memory stores | COMPLETE | `grant-store.ts` | — |
| AUD-39 Optimize JSON serialization loops | COMPLETE | `compaction.ts:498-517` | — |
| AUD-40 Consolidate TUI memos | SKIPPED | `which-key.tsx` — memos are correct and efficient | — |
