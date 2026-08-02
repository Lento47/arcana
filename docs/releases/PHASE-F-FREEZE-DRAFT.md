# Phase F — GA Freeze Draft

**Status:** DRAFT — cores for F1–F12 are implemented and tested in-repo;
the Phase F/Control 1.0 release freeze is NOT authorized. The outstanding
gates are operational/external, not code.
**Date:** 2026-08-02

## Playbook §40 gate evidence

| Gate | Required | Evidence | Verdict |
|---|---|---|---|
| Cross-tenant data leaks | 0 | F1 tenant store (tenant-filtered queries, deletion isolation) | PASS (core) |
| Unauthorized administrative actions | 0 | F2 RBAC permission matrix + privileged audit | PASS (core) |
| Federation authority amplification | 0 | F8 authority intersection (never broadens) | PASS (core) |
| Central approval bypass of local PEP | 0 | F5 central queue decides only; local PEP consumes by exact hash | PASS (design + core) |
| Unverifiable compliance exports | 0 | F6 fingerprint-verified archive exports (SDK verifier) | PASS (core) |
| Restore drills outside published RPO/RTO | 0 | F7 drill evaluation vs targets | PASS (evaluator); LIVE EXERCISE PENDING |
| Critical penetration-test findings unresolved | 0 | — | BLOCKED (external, BLK-F-13) |
| Fleet health false-positive "healthy" states | 0 | F4 health derivation (UNKNOWN/STALE explicit) | PASS (core) |

## Operational gates

| Gate | Status |
|---|---|
| Defined and measured SLOs | CORE DONE (availability target in F7); live measurement pending |
| Successful DR exercise | PENDING (live) |
| Successful compromised-node exercise | PENDING (live; F9 campaign core DONE) |
| Successful key-rotation exercise | PENDING (live; D-1 rotation DONE) |
| Tenant-isolation adversarial suite | CORE DONE (F1 tests + D-10 matrix) |
| Federation adversarial suite | CORE DONE (F8 tests) |
| Independent proof verification by a separate implementation | PENDING (L3; Rust verifier is the in-repo second implementation) |

## What remains for the freeze

1. Live DR, compromised-node, and key-rotation exercises (operator-run).
2. External architecture review + penetration test + threat-model review +
   supply-chain assessment (BLK-F-13).
3. L3 independent reproduction of core suites.
4. Production mounting of the enterprise cores into the console/API
   (F3 editor, F4 diagnostics, F5 escalation, F6 auditor console, F11 admin
   API/Terraform/SIEM).

## Nonclaims

- "Implemented core" means the security-relevant logic is implemented and
  tested in-repo; it is not a production GA claim.
- No compliance certification (SOC 2 / ISO 27001 / NIST) is claimed.
