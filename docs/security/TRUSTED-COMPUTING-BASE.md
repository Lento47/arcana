---
document_class: security_tcb
authority: reference
status: current
last_verified: 2026-08-02
status_source: docs/STATUS.md
---

# Arcana Trusted Computing Base

## Components trusted for authorization

- PDP (pure, deterministic, immutable snapshot)
- Capability grant store (SQLite, durable, exact)
- Intent-binding store (insert-only SQLite, contract-revision keyed)
- Approval store (SQLite, atomic claims)
- Verifier key material (Ed25519) and trust roots

## Components trusted for effect execution

- PEP adapters at declared effect boundaries (`tool.ts`, executor)
- `governed-executor.ts` (approval-driven execution)
- Bounded file reader (handle-bound identity)

## Components trusted for evidence

- Epistemic event store (SQLite, append-only semantics)
- RunProof projection and proof batching
- Governance event bridge + HTTP/SSE projection
- Canonical serializer (deterministic bytes)

## Assumptions

| Domain | Assumption | Status |
|---|---|---|
| SQLite | WAL, synchronous=FULL; migration chain authoritative | PRODUCTION-MOUNTED |
| Clock | Timestamps used for freshness/expiry; clock skew handled by envelope freshness checks | INTERNALLY-VALIDATED |
| OS | Process isolation provided by the host; no hostile-host claim | PARTIAL |
| Crypto | Ed25519 signatures; SHA-256 digests; domain-separated envelopes | INTERNALLY-VALIDATED (46 vectors, TS+Rust) |

## What each party controls

| Party | Controls |
|---|---|
| The model | Proposes actions only; cannot execute or self-approve |
| The engine | Decides authorization and executes declared effects |
| Plugins | Extend surfaces inside the effect boundary; governed by PEP |
| MCP servers | Execute only gateway-mediated calls; untrusted content never auto-binds intent |
| External CLIs | Can bypass everything outside the declared boundary (nonclaim) |
| Compromised host | Can falsify evidence, memory, and process state; hardware attestation required to change this |

## Strong Effect Assurance

Logical PEP Enforcement ∧ Physical Bypass Resistance ∧ Complete Evidence.
Current physical bypass resistance is PARTIAL; see
`docs/security/EFFECT-COVERAGE.md`.
