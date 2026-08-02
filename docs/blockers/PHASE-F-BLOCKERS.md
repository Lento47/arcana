# Phase F — Enterprise Control Plane and Federation: Blocker Register

**Status: PLANNED / PARTIAL — `packages/enterprise` is a dashboard scaffold;
no multi-tenant control plane, identity, fleet operations, federation, or
compliance archive is production-ready.**

## Open blockers

| ID | Task | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-F-01 | F1 multi-tenant organization model | **Tenant model + SQLite store IMPLEMENTED 2026-08-02** (all 10 entity kinds tenant-scoped; tenant-filtered queries; deletion isolation; 3 tests). Remaining: enterprise API mounting + retention policy doc | Tenant-isolation adversarial suite (core DONE; HTTP surface pending); deletion/retention documented |
| BLK-F-02 | F2 enterprise identity and access | **RBAC core DONE 2026-08-02** (tenant-scoped roles + permission matrix, privileged audit, immediate deprovisioning, time-bounded break-glass; 5 tests). Remaining: SSO/SCIM/MFA service integration, service accounts, separation-of-duties | Deprovisioning bound (0 ms core; SSO propagation pending); privileged actions audited (DONE); break-glass time-bounded (DONE) |
| BLK-F-03 | F3 central policy management | **Lifecycle DONE 2026-08-02** (D-4 signed store: validation-before-activation, staged rollout, transactional rollback, RunProof digest proof; F3: approved promotion + diff, 6 tests). Remaining: authoring/simulation editor surface | Activation requires validation (DONE); rollback transactional (DONE); nodes prove policy digest (DONE via RunProof); editor surface pending |
| BLK-F-04 | F4 fleet and node operations | **Fleet core DONE 2026-08-02** (tenant inventory, health derivation, heartbeats, upgrade rings, backlog; 3 tests). Remaining: remote diagnostics + rollout automation + console mounting | Fleet view distinguishes unknown/healthy (DONE); stale nodes explicit (DONE); diagnostics/automation pending |
| BLK-F-05 | F5 central approval operations | **Central queue DONE 2026-08-02** (exact inspection, separation of duties, expiry, bulk deny only, emergency revocation; 4 tests; local PEP remains the execution authority). Remaining: escalation routing + console mounting | Exact single-use approvals across network (core DONE); central UI cannot bypass local PEP (DONE by design); escalation pending |
| BLK-F-06 | F6 audit/compliance/evidence archive | **Archive core DONE 2026-08-02** (immutable retention, fingerprint-verified export, custody chain, legal hold, tenant isolation; 4 tests; auditor read-only enforced via F2 RBAC). Remaining: compliance mappings + auditor console | Exported proof verifies independently (fingerprint DONE; SDK verifier available); auditor read-only tenant-scoped (DONE via RBAC); mappings pending |
| BLK-F-07 | F7 HA/DR | **Core DONE 2026-08-02** (targets, digest-verified backup/restore, drill evaluation, degraded fail-closed; 3 tests). Remaining: live multi-region DR exercise + key backup automation | Restore drills meet RPO/RTO (evaluator DONE; live exercise pending); fail-closed behavior matches policy (DONE) |
| BLK-F-08 | F8 federation | **Core DONE 2026-08-02** (agreements, authority intersection, conflict resolution, proof exchange, revocation propagation; 5 tests). Remaining: cross-org approval routing + federated revocation transport | Federation intersects authority (DONE); unknown issuer fails closed (DONE); transport pending |
| BLK-F-09 | F9 enterprise security operations | no alerts/anomaly/campaign/incident workflows | Compromise simulation run; emergency deny propagates within target |
| BLK-F-10 | F10 data governance and privacy | no classification/regional storage/CMK/PII/telemetry contracts | Privacy/data-governance contracts documented |
| BLK-F-11 | F11 enterprise API and automation | no admin API/webhooks/Terraform/SIEM/ticketing | Admin API + webhooks + automation tested |
| BLK-F-12 | F12 commercial readiness | no licensing/entitlements/metering/support diagnostics | Metering never affects security decisions; docs complete |
| BLK-F-13 | F13 independent security assessment and GA freeze | no external architecture review/pen-test/threat model/supply-chain assessment | Blockers resolved; Control 1.0 + Phase F milestone frozen |

## Phase F hard gates (playbook §40) — all currently unprovable

Cross-tenant data leaks, unauthorized administrative actions, federation
authority amplification, central approval bypass of local PEP, unverifiable
compliance exports, restore drills outside RPO/RTO, unresolved critical
pen-test findings, and false-positive fleet health all require the F1–F13
implementations above before they can be measured.
