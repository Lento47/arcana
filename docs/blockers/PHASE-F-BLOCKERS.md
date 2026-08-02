# Phase F — Enterprise Control Plane and Federation: Blocker Register

**Status: PLANNED / PARTIAL — `packages/enterprise` is a dashboard scaffold;
no multi-tenant control plane, identity, fleet operations, federation, or
compliance archive is production-ready.**

## Open blockers

| ID | Task | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-F-01 | F1 multi-tenant organization model | **Tenant model + SQLite store IMPLEMENTED 2026-08-02** (all 10 entity kinds tenant-scoped; tenant-filtered queries; deletion isolation; 3 tests). Remaining: enterprise API mounting + retention policy doc | Tenant-isolation adversarial suite (core DONE; HTTP surface pending); deletion/retention documented |
| BLK-F-02 | F2 enterprise identity and access | **RBAC core DONE 2026-08-02** (tenant-scoped roles + permission matrix, privileged audit, immediate deprovisioning, time-bounded break-glass; 5 tests). Remaining: SSO/SCIM/MFA service integration, service accounts, separation-of-duties | Deprovisioning bound (0 ms core; SSO propagation pending); privileged actions audited (DONE); break-glass time-bounded (DONE) |
| BLK-F-03 | F3 central policy management | **Lifecycle DONE 2026-08-02** (D-4 signed store: validation-before-activation, staged rollout, transactional rollback, RunProof digest proof; F3: approved promotion + diff, 6 tests). **HTTP promotion/diff MOUNTED 2026-08-02** (`/api/enterprise/*/policies/*`: RBAC-checked promotion into per-environment target chains, structural diff; integration tested). Remaining: authoring/simulation editor surface | Activation requires validation (DONE); rollback transactional (DONE); nodes prove policy digest (DONE via RunProof); editor surface pending |
| BLK-F-04 | F4 fleet and node operations | **Fleet core DONE 2026-08-02** (tenant inventory, health derivation, heartbeats, upgrade rings, backlog; 3 tests). **HTTP register/heartbeat/fleet-view MOUNTED 2026-08-02** (integration tested). Remaining: remote diagnostics + rollout automation | Fleet view distinguishes unknown/healthy (DONE); stale nodes explicit (DONE); diagnostics/automation pending |
| BLK-F-05 | F5 central approval operations | **Central queue DONE 2026-08-02** (exact inspection, separation of duties, expiry, bulk deny only, emergency revocation; 4 tests; local PEP remains the execution authority). **HTTP emergency revoke + bulk deny MOUNTED 2026-08-02** (RBAC-checked; integration tested). Remaining: escalation routing | Exact single-use approvals across network (core DONE); central UI cannot bypass local PEP (DONE by design); escalation pending |
| BLK-F-06 | F6 audit/compliance/evidence archive | **Archive core DONE 2026-08-02** (immutable retention, fingerprint-verified export, custody chain, legal hold, tenant isolation; 4 tests; auditor read-only enforced via F2 RBAC). **HTTP archive/export/custody/legal-hold/retention-sweep MOUNTED 2026-08-02** (integration tested). Remaining: compliance mappings | Exported proof verifies independently (fingerprint DONE; SDK verifier available); auditor read-only tenant-scoped (DONE via RBAC); mappings pending |
| BLK-F-07 | F7 HA/DR | **Core DONE 2026-08-02** (targets, digest-verified backup/restore, drill evaluation, degraded fail-closed; 3 tests). Remaining: live multi-region DR exercise + key backup automation | Restore drills meet RPO/RTO (evaluator DONE; live exercise pending); fail-closed behavior matches policy (DONE) |
| BLK-F-08 | F8 federation | **Core DONE 2026-08-02** (agreements, authority intersection, conflict resolution, proof exchange, revocation propagation; 5 tests). Remaining: cross-org approval routing + federated revocation transport | Federation intersects authority (DONE); unknown issuer fails closed (DONE); transport pending |
| BLK-F-09 | F9 enterprise security operations | **Core DONE 2026-08-02** (alerts, incident timelines, audited revocation campaigns, forensic exports; 3 tests). **HTTP alerts/timeline/campaign/forensic MOUNTED 2026-08-02** (RBAC-checked; integration tested). Remaining: anomaly-detection heuristics + compromise simulation | Compromise simulation pending; emergency deny propagation (DONE, audited) |
| BLK-F-10 | F10 data governance and privacy | **Core DONE 2026-08-02** (classification, regional/CMK constraints, PII export control + retention; 3 tests). **HTTP governance checks MOUNTED 2026-08-02** (storable/exportable/classify/PII-retention; integration tested). Remaining: regional-storage plumbing + CMK integration | Contracts documented (DONE); storage plumbing pending |
| BLK-F-11 | F11 enterprise API and automation | **Admin HTTP surface MOUNTED 2026-08-02** (`/api/enterprise/*`: orgs, roles, fleet, approvals, audit, policy, security ops, governance, audit archive; 6 HTTP integration tests) + canonical admin events (2 tests). Remaining: Terraform provider, SIEM export, federation endpoints | Admin API + webhooks + automation tested (core HTTP surface DONE; Terraform/SIEM pending) |
| BLK-F-12 | F12 commercial readiness | **Core DONE 2026-08-02** (entitlements, metering-never-affects-security invariant, redacted diagnostics, upgrade policy; 4 tests). Remaining: license text review + metering pipeline | Metering never affects security decisions (DONE, tested); docs complete (DRAFT) |
| BLK-F-13 | F13 independent security assessment and GA freeze | **Freeze draft published 2026-08-02** (`PHASE-F-FREEZE-DRAFT.md`: §40 gate evidence + operational gates). Remaining: external architecture review, penetration test, threat-model review, supply-chain assessment, L3 reproduction, live exercises, Control 1.0 mounting | Blockers resolved + milestone frozen (all external/operational) |

## Phase F hard gates (playbook §40) — all currently unprovable

Cross-tenant data leaks, unauthorized administrative actions, federation
authority amplification, central approval bypass of local PEP, unverifiable
compliance exports, restore drills outside RPO/RTO, unresolved critical
pen-test findings, and false-positive fleet health all require the F1–F13
implementations above before they can be measured.
