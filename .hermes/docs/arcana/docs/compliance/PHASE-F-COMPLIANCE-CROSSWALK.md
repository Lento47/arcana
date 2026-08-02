# Phase F Compliance Crosswalk (Engineering Evidence Index)

**Status:** ENGINEERING EVIDENCE INDEX — 2026-08-02

This document maps the Phase F enterprise cores to commonly cited control
families (SOC 2, ISO/IEC 27001:2022, NIST SP 800-53). It is an index of
in-repo engineering evidence for auditors and reviewers. It is **not** a
certification claim: SOC 2 / ISO 27001 / NIST attestation requires a formal
external assessment (BLK-F-13) and explicit human sign-off.

## Mapping

| Phase F item | SOC 2 | ISO/IEC 27001:2022 | NIST SP 800-53 | In-repo evidence |
|---|---|---|---|---|
| F1 Multi-tenant organization model | CC6.1, CC7.2 | A.5.15, A.8.2 | AC-3, AC-4 | `packages/core/src/enterprise/tenant.ts` + SQLite store; tenant-filtered queries; D-10 hostile-node matrix |
| F2 Enterprise identity and RBAC | CC6.1, CC6.2 | A.8.2, A.9.2 | AC-2, AC-3, AC-6 | `identity.ts` + SQLite: role matrix, privileged audit, immediate deprovisioning, break-glass |
| F3 Central policy management | CC8.1 | A.8.25, A.8.26 | SA-10, CM-3 | `policy-lifecycle.ts` + D-4 signed bundle store: validation-before-activation, audited rollback, promotion |
| F4 Fleet and node operations | CC7.2 | A.8.16 | CM-8 | `fleet.ts` + SQLite: health derivation, heartbeats, node diagnostics, upgrade rings |
| F5 Central approval operations | CC6.1, CC6.7 | A.8.2, A.8.12 | AC-3, AC-6 | `approvals.ts`, `escalation.ts` + SQLite: exact inspection, SoD, bounded delegation, emergency revocation |
| F6 Audit/compliance/evidence archive | CC7.3 | A.8.15, A.8.16 | AU-2..AU-12 | `audit-archive.ts` + SQLite: fingerprint-verified exports, custody, legal hold, retention |
| F7 HA/DR | CC7.5, CC9.1 | A.5.29, A.5.30 | CP-9, CP-10 | `reliability.ts` + SQLite: RPO/RTO targets, digest-verified backup/restore, drill evaluation |
| F8 Federation | CC6.1 | A.5.22 | IA-2, AC-3 | `federation.ts`, `federation-approvals.ts` + SQLite: authority intersection, bounded cross-org routing |
| F9 Enterprise security operations | CC7.2, CC7.4 | A.8.16, A.5.25 | IR-4, IR-6, AU-6 | `security-ops.ts` + SQLite: alerts, timelines, audited revocation campaigns, forensic exports |
| F10 Data governance and privacy | C1, C2 | A.8.11, A.8.12 | SI-12, SC-28 | `data-governance.ts`: classification, regional/CMK, PII export/retention |
| F11 Enterprise API and automation | CC7.1 | A.8.15 | AU-6, AU-12 | `admin-events.ts`, `admin-events-sqlite.ts`, `siem-export.ts` + `/api/enterprise/*` |
| F12 Commercial readiness | CC6.1 | A.5.15 | AC-3 | `commercial-readiness.ts`, `metering.ts` + SQLite: metering never affects decisions |
| F13 Assessment and GA freeze | CC8.1 | A.8.25, A.5.8 | CA-2 | `docs/releases/PHASE-F-FREEZE-DRAFT.md`; external assessment pending (BLK-F-13) |

## Known limits

- Compliance mappings are engineering evidence, not audit attestation.
- Live exercises (DR, compromised-node, key rotation) and L3 independent
  reproduction are still pending and are required before any GA claim.
- SOC 2 / ISO / NIST formal certifications are explicitly out of scope until
  an external assessor completes the engagement.
