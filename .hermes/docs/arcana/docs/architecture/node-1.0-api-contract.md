# Arcana Node 1.0 — API Contract (freeze draft)

**Document class:** architecture/contract
**Status:** FROZEN SURFACE DRAFT — the API surface below is the Node 1.0
contract; the Node 1.0 **release freeze is NOT yet authorized** (gates below).
**Date:** 2026-08-02
**Branch:** `phase-d-implementation`

## 1. Purpose

This document fixes the Node 1.0 protocol and operator surface so adapters,
control planes, and tests can build against stable identifiers. It records
the playbook §31 gate evidence and the exact outstanding items that must
close before the milestone can be tagged.

## 2. Node state model

```text
identity:     UNREGISTERED | PENDING | TRUSTED | SUSPENDED | REVOKED
enforcement:  ONLINE | OFFLINE_RESTRICTED | OFFLINE_READ_ONLY | QUARANTINED
policy:       CURRENT | STALE | INVALID | UNAVAILABLE
revocation:   CURRENT | STALE | INVALID | UNAVAILABLE
proof state:  PENDING_REGISTRATION | REGISTERED | POISONED
execution:    PENDING | EXECUTING | COMPLETED | FAILED |
              UNKNOWN_AFTER_CRASH | UNKNOWN_AFTER_NETWORK | REJECTED
```

## 3. Frozen HTTP surface (co-located control plane, local daemon)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/nodes/enroll` | Join-token enrollment ceremony (D-1) |
| POST | `/api/nodes/:nodeId/rotate` | Key rotation, epoch-advancing (D-1) |
| POST | `/api/nodes/:nodeId/status` | TRUSTED / SUSPENDED / REVOKED (D-1) |
| GET | `/api/nodes/:nodeId` | Enrolled node record (D-1) |
| POST | `/api/sync/policy` | Signed policy sync (D-6B-T) |
| POST | `/api/sync/revocation` | Signed revocation sync (D-6B-T) |
| POST | `/api/policy/bundles` | Publish signed policy bundle (D-4) |
| GET | `/api/policy/current` | Latest active policy (D-4) |
| POST | `/api/policy/rollback` | Explicit audited rollback (D-4) |
| POST | `/api/revocations` | Publish signed revocation statement (D-5) |
| GET | `/api/revocations/current` | Latest revocation statement (D-5) |
| POST | `/api/revocations/emergency` | Emergency node denial (D-5) |
| POST | `/api/proof/batches` | Register signed proof batch (D-8B) |
| GET | `/api/proof/nodes/:nodeId/reconcile` | Proof reconciliation (D-8B) |
| POST | `/api/executions/claim` | Exactly-once execution claim (D-6) |
| POST | `/api/executions/:executionId/complete` | Outcome recording (D-6) |
| POST | `/api/executions/:executionId/unknown` | Crash/network ambiguity (D-6) |

## 4. Frozen CLI surface

```text
arcana node enroll  --token <json> --key <seed> --endpoint <url>
arcana node proof upload --endpoint <url> [--first-sequence N]
arcana node sync policy|revocation --endpoint <url> --server-key <key>
arcana node status
```

## 5. Frozen core modules

- `node-enrollment.ts` / `node-enrollment-sqlite.ts` — ceremony, rotation,
  suspension, decommissioning
- `sync-transport.ts` / `sync-replay-store-sqlite.ts` — signed envelopes,
  replay protection
- `policy-bundle-store.ts` / `-sqlite.ts` — signed bundles, staged rollout,
  last-known-good, rollback
- `revocation-store.ts` / `-sqlite.ts` + `revocation-convergence.ts` —
  statements, sequence monotonicity, p50/p95 lag bounds
- `execution-ledger.ts` / `-sqlite.ts` — exactly-once coordination
- `governed-distributed-pep.ts` — offline + revocation + claim gates
- `proof-registration.ts` / `-sqlite.ts`, `proof-uploader.ts`,
  `proof-outbox-sqlite.ts` — proof registration and upload
- `local-proof-source.ts` — durable local proof store → outbox integration
- `hostile-node-evaluation.test.ts` — D-10 frozen matrix

## 6. Playbook §31 gate evidence

| Gate | Required | Evidence | Verdict |
|---|---|---|---|
| Forged grants accepted | 0 | D-10 matrix fixture 1 | PASS |
| Wrong-audience grants accepted | 0 | D-10 matrix fixture 2 | PASS |
| Executions after bounded revocation window | 0 | D-5 snapshot sync + D-10 fixture 6; emergency deny 401 | PASS (pull-based) |
| Distributed duplicate protected effects | 0 | D-6 ledger + governed PEP (fixtures 3/8) | PASS |
| Missing proof segments classified COMPLETE | 0 | D-8B reconcile gap detection (fixture 9) | PASS |
| Unsupported policy fields silently ignored | 0 | D-4 strict schema rejection | PASS |
| Node identity substitution successes | 0 | D-10 fixture 10 | PASS |
| Phase C local regression failures | 0 | core 1373/7/0; Phase C suites intact | PASS |

## 7. Outstanding gates before the release freeze

| Blocker | What remains | Why it blocks |
|---|---|---|
| BLK-D-07 | TLS/mTLS transport encryption + channel binding; OS-level key protection | Playbook D3 requires authenticated, encrypted channels; message-layer auth is DONE but passive MITM confidentiality is not |
| BLK-D-03 | D-6A-L live Linux workload identity validation | Node identity must be validated against a live Linux workload, not fixtures only |
| BLK-D-04 | Local proof-store integration feeding the outbox | **DONE 2026-08-02** — `local-proof-source.ts` reads `.arcana/proofs`, builds ordered chained batches, wired into `arcana node proof upload` (2 tests) |
| D-5 | Emergency push (SSE/WS) beyond pull-based polling | Convergence currently bounded by poll interval; push channel optional for CRITICAL target hardening |
| D-4 | DELTA bundles + compatibility negotiation | **DELTA transport DONE 2026-08-02** — control plane serves POLICY_DELTA (one-step gap with matching base digest) and REVOCATION_DELTA (statements after accepted sequence, bounded at 32); core verification fails closed to FULL_SNAPSHOT_REQUIRED; **node-side sync client validates deltas before acceptance 2026-08-02** (base/sequence/result/target consistency, contiguous revocation statements). Remaining: node runtime local persistence of applied deltas + consumption of declared `compatibleFrom`/`compatibleTo` ranges |
| L3 | Independent reproduction of the D-10 matrix | Frozen in-repo suite; external reproduction not yet obtained |

## 8. Nonclaims

- Node 1.0 does not claim hostile-host containment, hardware attestation, or
  TLS by default.
- The API surface is local daemon + co-located control plane; remote
  deployments require the BLK-D-07 work.
- Offline enforcement is bounded by the D-9 lease policy, never unbounded.
