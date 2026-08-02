# Phase D — Distributed Governed Autonomy: Blocker Register

**Status: ACTIVE DEVELOPMENT — ~45–55% by playbook weighting. D-7 FROZEN
(`arcana-phase-d7-local-distributed-authority`), D-8A proof batching
implemented.**

## Open blockers

| ID | Task | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-D-01 | D-6B-T production authenticated transport | D-6B sync control exists; authenticated encrypted node/control-plane transport not implemented | MITM fixtures fail; wrong org/audience fails; expired credentials fail |
| BLK-D-02 | D-7.1 kernel-enforced filesystem containment | `SafeBoundedFileReader` v2 is user-space; Linux `openat2 RESOLVE_BENEATH` implemented in `tools/fs-containment-rust`; **Windows opened-handle final-path reader implemented 2026-08-02** (lexical `..` rejection, reparse-point rejection per component, volume/file identity, final-path containment — 10/10 tests incl. real junction-escape fixture). Remaining: engine integration into the production reader + live Linux workload validation | openat2/Windows-handle containment tests on real platforms; production `SafeBoundedFileReader` uses the native reader; tag `arcana-phase-d7.1-filesystem-containment` |
| BLK-D-03 | D-6A-L live Linux workload identity | parser/TOCTOU tests exist; no live Linux workload validation | Live Linux workload validation results |
| BLK-D-04 | D-8B remote proof registration | **Control-plane registration IMPLEMENTED 2026-08-02** (`proof-registration.ts`, `SqliteProofBatchLedger`, HTTP `POST /api/proof/batches` + `GET /api/proof/nodes/:nodeId/reconcile`; 16 core + 2 HTTP tests). **Node side IMPLEMENTED 2026-08-02**: `proof-uploader.ts` (backoff/jitter, receipt idempotency, poison states), `proof-outbox-sqlite.ts` (durable outbox, restart-safe due selection), engine `proof-upload-client.ts` (HTTP transport mapping), 11 core + 4 engine tests. Remaining: scheduler/CLI wiring for the upload loop + hostile-node duplicate-delivery matrix. Node registry remains env-backed pending D-1 enrollment (BLK-D-05) | Upload loop wired into a node scheduler/CLI; hostile-node matrix; node/server hash reconciliation exercised end-to-end |
| BLK-D-05 | Node enrollment and key rotation | identity envelope/contracts exist; enrollment ceremony, durable rotation, decommissioning pending | Unknown-node rejection, rotated-key rejection, duplicate-enrollment detection fixtures |
| BLK-D-06 | D-9 partition/offline policy | Reducer (`D-4C`) implements the enforcement state machine; **offline grant/lease policy IMPLEMENTED 2026-08-02** (`offline-policy.ts`: offlineEnabled grants, min(grant expiry, lease end, per-grant override), approval-required denial, policy/revocation lease freshness, consequential window, doc-default config; 15 tests). Remaining: wire the policy into the distributed PEP effect path and run node-level partition tests + reconnection reconciliation exercise | Partition tests match documented policy through the distributed PEP; TTL enforcement; reconnection reconciliation |
| BLK-D-07 | Operational deployment | no deployment topology/trust-bootstrap/monitoring procedures exercised | Deployment runbook + exercised topology |
| BLK-D-08 | D-10 hostile-node adversarial evaluation | no frozen distributed adversarial suite | Forged grants, wrong audience, replay, clock skew, key rotation, delayed revocation, partition, duplicate execution, proof omission, node replacement — all zero |
| BLK-D-09 | Node 1.0 freeze | no Node 1.0 API contract or milestone doc | Playbook §31 gates all zero + Node 1.0 milestone frozen |

## Partial evidence (already implemented)

| Task | Status evidence |
|---|---|
| D1 node identity | envelope/contracts exist; enrollment pending (BLK-D-05) |
| D2 signed short-lived grants | envelope schema + 7-layer verifier + 46 cross-runtime conformance vectors (41 negative) + Rust conformance 2/2 |
| D3 mutual authentication | D-6B authenticated sync control exists; production transport pending (BLK-D-01) |
| D4 policy distribution | envelope carries policy digest chains; signed bundle distribution pending |
| D5 remote revocation | revocation envelopes, durable state, sync protocol exist; convergence measurement pending |
| D6 replay resistance | reducers/durable state/sync protocol exist; duplicate-execution matrix pending |
| D7 proof synchronization | FROZEN local milestone (`017ad998`); kernel containment is BLK-D-02 |
| D8 proof composition | D-8A local batching implemented; D-8B remote registration pending (BLK-D-04) |

## Performance gates not yet measured

Signature verification p95 < 2 ms, local grant validation p95 < 5 ms, connected
revocation p95 within risk target, proof-segment enqueue p95 < 10 ms, node
startup to enforcement-ready — all pending measurement infrastructure.
