# Phase D — Remaining Roadmap and Progress Report

**Status: PROGRESS REPORT — not a kickoff and not a sign-off.**

Phase D implementation has progressed through D-8A. D-7 is frozen as a local
distributed-authority milestone, D-8A proof batching is implemented, and
several earlier work packages remain partially complete. Rough completion by
playbook weighting: **45–55%** (estimate, not a declaration).

This document describes only the remaining work. It does not restart D1–D8A.

## 1. Status by work package (playbook §30)

| ID | Work package | Status |
|----|--------------|--------|
| D1 | Node identity + enrollment | PARTIAL — identity envelope/contracts exist; enrollment ceremony, durable key rotation, decommissioning pending |
| D2 | Signed short-lived grants | IMPLEMENTED — envelope schema + 7-layer verifier + 46 cross-runtime conformance vectors (41 negative) |
| D3 | Mutual node/control-plane authentication | PARTIAL — D-6B authenticated sync control exists; production authenticated transport (D-6B-T) pending |
| D4 | Policy distribution/versioning | PARTIAL — envelope schema carries policy digest chains; signed bundle distribution, last-known-good, rollback rules pending |
| D5 | Remote revocation | PARTIAL — revocation envelopes, durable state, sync protocol exist; convergence measurement pending |
| D6 | Distributed replay resistance / exactly-once | PARTIAL — reducers, durable state, sync protocol exist; cross-node duplicate-execution matrix pending |
| D7 | Proof synchronization | FROZEN — local distributed-authority milestone (`arcana-phase-d7-local-distributed-authority` → `017ad998`); D-7.1 kernel containment pending |
| D8 | Cross-node proof composition | PARTIAL — D-8A local proof batching (Merkle root + gap detection) implemented; D-8B remote proof registration pending |
| D9 | Partition/offline policy | PENDING |
| D10 | Phase D adversarial evaluation + freeze | PENDING |

## 2. Nonclaims

- Hostile-host containment is not claimed; hardware-backed attestation and an
  explicitly evaluated trust model are required before claiming it.
- No Phase D milestone beyond D-7 is frozen.
- No Node 1.0 API or release gate is claimed.

## 3. Remaining work (ordered)

1. **D-6B-T — Production authenticated transport** — authenticated, encrypted
   node/control-plane channels; replay protection; channel binding; strict
   audience validation. Exit: MITM fixtures fail; wrong organization/audience
   fails; expired credentials fail.
2. **D-7.1 — Linux openat2 and Windows handle containment** — kernel-enforced
   beneath-root resolution (`openat2 RESOLVE_BENEATH`) and Windows
   opened-handle final-path validation, building on `SafeBoundedFileReader` v2
   (lexical rejection, realpath, same-handle fstat/read, object identity).
   Tag as `arcana-phase-d7.1-filesystem-containment`; do not move the D-7 tag.
3. **D-6A-L — Live Linux workload identity validation** — parser/TOCTOU tests
   exist; validate against a live Linux workload, not fixtures only.
4. **D-8B — Remote proof registration** — control-plane registration of node
   proof segments; cross-node gap detection; node/server hash reconciliation.
5. **Node enrollment and key rotation** — enrollment ceremony, durable
   rotatable node identity, decommissioning, rotated-key rejection.
6. **Offline and partition policy** — explicit ONLINE/DEGRADED/OFFLINE
   semantics; short-TTL offline grants; reconnection reconciliation.
7. **Operational deployment** — deployment topology, trust bootstrap,
   monitoring, operator procedures.
8. **Hostile-node adversarial evaluation** — forged grants, wrong audience,
   replay, clock skew, key rotation, delayed revocation, partition, duplicate
   execution, proof omission, node replacement.
9. **Final Node 1.0 freeze** — APIs and milestone documentation frozen;
   playbook §31 release gates all zero.

## 4. Relationship to other artifacts

- Release sign-off (Phase A/B/C + TUI-2):
  `docs/audits/ARCANA-SIGNOFF-2026-08-01.md`
- TUI-2.1 freeze sign-off:
  `docs/audits/TUI-2.1-FREEZE-SIGNOFF-2026-08-01.md`
- This document grants no approval and starts no implementation.

Do not restart D1–D8A. Do not re-kick off Phase D from the beginning.
