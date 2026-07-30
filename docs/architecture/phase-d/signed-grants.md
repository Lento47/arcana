# Signed Capability Grants

> Phase D Architecture — Design Document
> Status: DESIGN (not implemented)
> Created: 2026-07-29

## Purpose

Define how capability grants are signed, verified, and transported between Arcana Nodes for distributed enforcement.

## Design Questions (Frozen)

### Signing Algorithm

**Decision: Ed25519**

- Fast verification (~60μs)
- Small signatures (64 bytes)
- No certificate chain required for intra-cluster trust
- Standard library availability across runtimes

Future: upgrade path to post-quantum signatures via algorithm identifier in envelope.

### Grant Canonicalization

**Decision: Deterministic JSON canonicalization**

```
canonicalGrant = JSON.stringify({
  version: 1,
  grantId,
  issuerId,
  audienceNodeId,
  principal: { kind, id },
  actions: [...sorted],
  resources: [...sorted],
  workspaceId,
  contractId,
  contractRevision,
  issuedAt,     // ISO 8601, millisecond precision
  expiresAt,    // ISO 8601, millisecond precision
  nonce,
  maxUses,
  delegationDepth,
  policyVersion,
  issuerEpoch,
})
```

- Keys sorted alphabetically
- Arrays sorted by string comparison
- No whitespace
- No undefined/null optional fields (omit entirely)

### Issuer Identity

**Decision: Node identity key**

The issuer is the node that creates the grant. The issuer's Ed25519 public key is the node's identity key, distributed via the node identity protocol.

```
type IssuerIdentity = {
  nodeId: string          // unique node identifier
  publicKey: Uint8Array   // Ed25519 public key (32 bytes)
  displayName: string
}
```

### Node Audience

**Decision: Single-node audience with delegation chain**

Each grant is bound to a specific audience node. The audience node is the only node authorized to use the grant.

```
type AudienceBinding = {
  nodeId: string          // target node identifier
  delegationChain: string[]  // node IDs in delegation path (root → current)
}
```

Delegation chain allows a grant issued by node A to be used by node C via node B, but only if A → B → C is a valid chain.

### Principal Identity

**Decision: Same as local Phase C principal**

```
type PrincipalIdentity = {
  kind: "agent" | "subagent" | "user"
  id: string              // canonical principal ID (agent name, user ID, etc.)
}
```

### Workspace and Contract Binding

**Decision: Workspace-scoped, contract-referenced**

```
type WorkspaceBinding = {
  workspaceId: string
  workspaceRoot: string   // canonical path
}

type ContractReference = {
  contractId: string
  revision: number
  hash: string            // SHA-256 of contract content
}
```

The workspace binding ensures grants cannot escape their workspace. The contract reference ties the grant to a specific contract revision for auditability.

### Issued-At and Expiry

**Decision: ISO 8601 with millisecond precision**

```
issuedAt: "2026-07-29T12:00:00.000Z"
expiresAt: "2026-07-29T13:00:00.000Z"
```

Maximum grant lifetime: **1 hour** (configurable, hard-capped at 24 hours).

Offline nodes receive short-lived grants. Renewal requires online contact with the issuer.

### Policy Version

**Decision: Monotonic policy sequence number**

```
policyVersion: 42
```

Nodes reject grants with policy versions below their offline minimum. This prevents stale grants from being used after a policy change.

### Nonce

**Decision: Random UUID v4**

```
nonce: "a1b2c3d4-e5f6-4g7h-8i9j-0k1l2m3n4o5p"
```

Prevents replay of the same grant content. Each grant has a unique nonce even if all other fields are identical.

### Delegation Ancestry

**Decision: Signed ancestry chain**

```
type DelegationAncestry = {
  parentGrantId: string
  parentSignature: string
  depth: number
}
```

Child grants include the parent grant ID and signature. Verifiers can reconstruct the full delegation chain by following parent references.

### Maximum Offline Validity

**Decision: 1 hour default, 24 hours hard cap**

```
maxOfflineValidity: "1h"  // default
maxOfflineValidity: "24h" // hard cap
```

After expiry, the node must contact the issuer for renewal. No automatic renewal.

### Key Rotation

**Decision: Epoch-based rotation**

```
type KeyRotation = {
  currentEpoch: number
  previousKey?: Uint8Array
  rotationAt: string
}
```

When a node rotates its key:
1. New key is published to the trust registry
2. Old key remains valid for grace period (1 hour)
3. All grants issued with old epoch are rejected after grace period
4. Nodes must re-request grants with new key

### Signature Verification Failure Behavior

**Decision: Fail-closed, log, deny**

```
signatureVerificationFailed →
  log(ALERT, { grantId, nodeId, reason })
  → DENY
  → emit security event: authorization.signature_verification_failed
```

No retry. No fallback. No silent acceptance.

## Signed Capability Envelope

```typescript
type SignedCapabilityEnvelope = {
  version: 1

  // Identity
  issuerId: string
  issuerEpoch: number
  audienceNodeId: string

  // Grant content
  grant: {
    grantId: string
    principal: { kind: string; id: string }
    actions: string[]
    resources: string[]
    workspaceId: string
    contractId: string
    contractRevision: number
    maxUses: number | "unlimited"
    delegationDepth: number
    delegationAncestry?: DelegationAncestry
  }

  // Timing
  issuedAt: string      // ISO 8601
  expiresAt: string     // ISO 8601
  nonce: string         // UUID v4

  // Policy
  policyVersion: number

  // Signature
  signatureAlgorithm: "Ed25519"
  signature: string     // base64-encoded 64-byte signature
}
```

## Distributed Execution Rule

```
Effect_node(q) ⟹
  LocalPhaseCConditions(q)
  ∧ SignatureValid(grant)
  ∧ IssuerTrusted(grant)
  ∧ AudienceMatches(node)
  ∧ GrantFresh(grant)
  ∧ RevocationStateAcceptable(grant)
```

All six conditions must be satisfied. Failure of any condition → DENY.

## Node Rejection Conditions

A node must reject a signed grant if:

1. Unknown issuer (not in trust registry)
2. Wrong node audience (not this node)
3. Old issuer epoch (below current)
4. Expired grant (expiresAt < now)
5. Revoked grant ID (in revocation list)
6. Unsupported schema version (version ≠ 1)
7. Invalid signature (verification fails)
8. Broken ancestry (parent signature invalid)
9. Policy version below offline minimum
10. Nonce already used (replay detection)
