---
document_class: protocol_registry
authority: reference
status: current
last_verified: 2026-08-02
status_source: docs/STATUS.md
---

# Schema Version Registry

Stability vocabulary: `FROZEN` · `STABLE` · `EXPERIMENTAL` ·
`NOT IMPLEMENTED`. Internal schemas are stable; none are published as a public
protocol yet.

| Schema | Version | Canonical serializer | Test vectors | Stability | Status |
|---|---|---|---|---|---|
| AuthorizationRequest (hash input) | 1 | `canonical-serializer.ts` | request-hash suites | STABLE | INTERNALLY-VALIDATED |
| Capability grant envelope | 1 | canonical serializer | 46 conformance vectors | STABLE | INTERNALLY-VALIDATED |
| Policy envelope | 1 | canonical serializer | vector suite | STABLE | INTERNALLY-VALIDATED |
| Node identity certificate | 1 | canonical serializer | vector suite | STABLE | INTERNALLY-VALIDATED |
| Revocation statement | 1 | canonical serializer | vector suite | STABLE | INTERNALLY-VALIDATED |
| Approval record | 1 | SQLite row + wire form | approval suites | STABLE | PRODUCTION-MOUNTED |
| RunProof event | 1 | event store schema | RunProof suites | STABLE | PRODUCTION-MOUNTED |
| Proof batch (Merkle) | 1 | D-8A batching | run-d8a suites | EXPERIMENTAL | INTERNALLY-VALIDATED |
| Sync protocol message | 1 | `sync-protocol.ts` | sync suites | EXPERIMENTAL | INTERNALLY-VALIDATED |
| SDK wire types | v2 | OpenAPI-generated | SDK tests | STABLE | PRODUCTION-MOUNTED |
| Public proof protocol | — | — | — | — | NOT IMPLEMENTED |

## Publication gate (nonclaim)

Stable proof schemas, canonical serialization rules, independent verification
tooling, public test vectors, and at least one verifier outside the main
repository are required before RunProof can be called a public protocol.
