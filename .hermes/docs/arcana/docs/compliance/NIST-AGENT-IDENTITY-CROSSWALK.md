---
document_class: compliance_crosswalk
authority: reference
status: current
last_verified: 2026-08-02
status_source: docs/STATUS.md
---

# NIST AI Agent Standards Initiative — Arcana Crosswalk

NIST's initiative is concentrating on interoperable protocols, agent
authentication and identity, security evaluation, authorization, auditing and
non-repudiation. This crosswalk maps each focus area to Arcana's current
mechanism and status. It is a mapping, not a certification.

| NIST focus area | Arcana mechanism | Status |
|---|---|---|
| Interoperable protocols | Canonical serializer, signed envelope schemas, SDK wire types | PARTIAL — internal schemas stable; public protocol not published |
| Agent authentication and identity | `NodeIdentityCertificate`, 3-layer identity contracts, verifier audience checks | PARTIAL — identity primitives implemented; enrollment ceremony and key rotation pending |
| Security evaluation | Frozen adversarial suite (95 fixtures / 0 false allows), 46 cross-runtime conformance vectors | INTERNALLY-VALIDATED — no independent reproduction (L3+) yet |
| Authorization | Deterministic PDP + fresh PEP + exact request hashing + intent/contract/criterion binding | PRODUCTION-MOUNTED / INTERNALLY-VALIDATED |
| Auditing | Durable governance event families, RunProof, trace health, SSE projection | PRODUCTION-MOUNTED / INTERNALLY-VALIDATED |
| Non-repudiation | Signed envelopes, immutable event chain, Merkle proof batching (D-8A) | PARTIAL — local proof strong; remote registration (D-8B) and public verifier pending |
| Agent identity lifecycle | Durable node identity + revocation envelopes | PARTIAL — rotation/decommissioning pending |
| Supply-chain confidence | Lockfile, dependency reachability triage | PARTIAL — no SBOM/attestation |
| Schema controls | Zod schemas + canonical serialization + version registry (`docs/protocol/SCHEMA-VERSION-REGISTRY.md`) | PARTIAL |

See also `docs/competitive/2026-08-02-market-assessment.md` for source
references and `docs/security/TRUSTED-COMPUTING-BASE.md` for trust
boundaries.
