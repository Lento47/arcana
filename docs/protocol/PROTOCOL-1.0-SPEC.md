# Arcana Protocol 1.0 — Specification (freeze draft)

**Document class:** protocol specification (normative draft)
**Status:** INTERNALLY-VALIDATED — frozen surface draft, NOT yet a public
protocol release. The publication gate (independent verifier outside the
repository, public vectors, external review) is tracked in BLK-E-01.
**Version:** 1.0-draft
**Date:** 2026-08-02

## 1. Canonical serialization

All protocol objects use the canonical serializer
(`packages/core/src/crypto/canonical-serializer.ts`):

- Object keys in deterministic (sorted) order; no duplicate keys anywhere.
- `undefined` values are rejected; optional fields are omitted from the wire
  form (never `null` unless the field is explicitly nullable).
- Non-finite numbers are rejected.
- The same bytes must be produced by any conforming implementation.

## 2. Signature domains (domain-separated Ed25519)

| Domain | Object |
|---|---|
| `arcana:signed-capability:v1` | Signed capability grant envelope |
| `arcana:signed-policy:v1` | Signed policy envelope |
| `arcana:node-identity:v1` | Node identity certificate |
| `arcana:revocation:v1` | Revocation statement |
| `arcana:node-proof-batch:v1` | Node proof batch |
| `arcana:join-token:v1` | Enrollment join token |
| `arcana:sync-request:v1` / `arcana:sync-response:v1` / `arcana:sync-ack:v1` | Sync transport |

Signature input = `UTF8(domain) ‖ canonical(unsigned payload)`.

## 3. Object registry (schema version 1)

| Object | Required fields (non-exhaustive) | Semantics |
|---|---|---|
| AuthorizationRequest | requestId, requestHash, nonce, policyVersion, principalId, sessionId, workspaceId, contractId+revision, action, resource, arguments, cwd/destination, provenance, sensitivity, riskClass | Any meaningful field change changes the hash |
| SignedCapabilityEnvelope | schemaVersion, issuerId+epoch, audienceNodeId, grant, issuedAt, expiresAt, nonce, signature | Audience-bound, expiring |
| SignedPolicyEnvelope | schemaVersion, issuerId+epoch, sequence, policyId, policyVersion, policyDigest, previousPolicyDigest?, issuedAt, expiresAt, signature | Chain-ordered; unknown mandatory fields rejected |
| NodeIdentityCertificate | schemaVersion, nodeId, organizationId, publicKey, issuerId+epoch, issuedAt, expiresAt, capabilities, signature | Current epoch only |
| RevocationStatement | schemaVersion, issuerId+epoch, sequence, subjectType (GRANT/NODE/ISSUER_KEY/POLICY), subjectId, reason, effectiveAt, issuedAt, signature | Sequence-monotonic; rollback rejected |
| ScopedApproval | approvalId, requestHash, principal, session, contractRevision, resource, arguments, expiry, maxUses=1, status | PENDING→APPROVED→CLAIMED→CONSUMED |
| DelegationRequest/Result | parentGrantId, childScope, attenuation proof, depth | Authority(child) ⊆ Authority(parent) |
| ProofBatch (node) | trustDomain, nodeId, nodeKeyEpoch, sequence range, previousBatchRoot?, eventMerkleRoot, runProofHashes, policy/revocation state, signature | Deterministic Merkle root + chain linkage |
| Event envelope | id, sequence, type, payload, previousHash, hash | Append-only hash chain |
| RunProof | proof schema 0.2; trace/integrity/verification/reproducibility axes + security profiles | Immutable; revalidation links new results |

## 4. Security labels

- Provenance: SYSTEM_POLICY, USER_INSTRUCTION, ACTIVE_CONTRACT,
  TRUSTED_LOCAL_SOURCE, UNTRUSTED_LOCAL_SOURCE, REMOTE_CONTENT, TOOL_OUTPUT,
  MODEL_OUTPUT, SUBAGENT_OUTPUT, MCP_DESCRIPTION.
- Sensitivity lattice: PUBLIC ≤ INTERNAL ≤ PRIVATE ≤ SECRET; unknown lineage
  on HIGH/CRITICAL fails closed.

## 5. Error and reason-code registry

Verification stages: PARSE · SCHEMA · SIGNATURE · TRUST · AUDIENCE ·
FRESHNESS · REVOCATION.

Rejection reasons: INVALID_SIGNATURE, UNKNOWN_ISSUER, ISSUER_EPOCH_TOO_OLD,
WRONG_AUDIENCE, EXPIRED, SEQUENCE_ROLLBACK, DIGEST_MISMATCH,
SCHEMA_UNSUPPORTED, ANCESTRY_INVALID, REVOKED.

Sync response kinds: NO_CHANGE, POLICY_SNAPSHOT, POLICY_DELTA,
REVOCATION_SNAPSHOT, REVOCATION_DELTA, FULL_SNAPSHOT_REQUIRED, QUARANTINE,
RETRY_LATER.

Execution statuses: PENDING, EXECUTING, COMPLETED, FAILED,
UNKNOWN_AFTER_CRASH, UNKNOWN_AFTER_NETWORK, REJECTED.

## 6. Version negotiation and extensions

- `schemaVersion: 1` is the only supported version; unknown versions fail at
  SCHEMA.
- Unknown mandatory fields are rejected (strict schema); optional extension
  fields must be namespaced (prefix `x-`) and never alter security semantics.
- Compatibility ranges for policy bundles are declared at publish
  (`compatibleFrom`/`compatibleTo`) and enforced by nodes.

## 7. Nonclaims

- This draft is not a public protocol release; no external implementation has
  been certified against it.
- TLS transport encryption is deployment scope (BLK-D-07), not part of this
  message-layer specification.
