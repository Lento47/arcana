# Phase F — Enterprise Control Plane and Federation: Blocker Register

**Status: PLANNED / PARTIAL — `packages/enterprise` is a dashboard scaffold;
no multi-tenant control plane, identity, fleet operations, federation, or
compliance archive is production-ready.**

## Open blockers

| ID | Task | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-F-01 | F1 multi-tenant organization model | no tenant-scoped record model | Tenant-isolation adversarial suite: 0 leaks; tenant deletion/retention documented |
| BLK-F-02 | F2 enterprise identity and access | no SSO/SCIM/MFA/RBAC/service accounts | Deprovisioning bound measured; privileged actions audited; break-glass time-bounded |
| BLK-F-03 | F3 central policy management | no authoring/simulation/staged rollout/signed distribution | Activation requires validation; rollback transactional; nodes prove policy digest |
| BLK-F-04 | F4 fleet and node operations | no enrollment inventory/health/upgrade rings | Fleet view distinguishes unknown/healthy; stale nodes explicit |
| BLK-F-05 | F5 central approval operations | no central approval queues/escalation | Exact single-use approvals across network; central UI cannot bypass local PEP |
| BLK-F-06 | F6 audit/compliance/evidence archive | no immutable proof retention/search/export/legal hold | Exported proof verifies independently; auditor read-only tenant-scoped |
| BLK-F-07 | F7 HA/DR | no availability targets/RPO/RTO/backup drills | Restore drills meet RPO/RTO; fail-closed behavior matches policy |
| BLK-F-08 | F8 federation | no federation agreement/issuer/audience model | Federation intersects authority; unknown issuer fails closed |
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
