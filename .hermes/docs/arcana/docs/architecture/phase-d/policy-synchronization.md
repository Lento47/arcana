# Policy Synchronization

> Phase D Architecture — Design Document
> Status: DESIGN (not implemented)
> Created: 2026-07-29

## Purpose

Define how policy state is synchronized between Arcana Nodes, ensuring all nodes enforce consistent authorization rules even during network partitions.

## Signed Policy Envelope

```typescript
type SignedPolicyEnvelope = {
  version: 1

  issuerId: string
  issuerEpoch: number
  sequence: number

  policyId: string
  policyVersion: string
  policyDigest: string      // SHA-256 of canonical policy content

  issuedAt: string          // ISO 8601
  expiresAt: string         // ISO 8601

  previousPolicyDigest?: string  // links to predecessor for chain validation

  signatureAlgorithm: "Ed25519"
  signature: string         // base64-encoded 64-byte signature
}
```

## Node Acceptance Invariant

```
AcceptPolicy(n, p) ⟺
  SignatureValid(p)
  ∧ IssuerTrusted(p)
  ∧ p.issuerEpoch ≥ n.minimumIssuerEpoch
  ∧ p.sequence > n.acceptedSequence
  ∧ SchemaSupported(p)
  ∧ DigestValid(p)
```

All six conditions must be satisfied. Failure of any condition → reject.

## Required Rejection Conditions

| # | Condition | Response |
|---|-----------|----------|
| 1 | Invalid signature | Reject + log ALERT |
| 2 | Unknown issuer | Reject + log ALERT |
| 3 | Old issuer epoch | Reject + log WARNING |
| 4 | Sequence rollback | Reject + log ALERT |
| 5 | Digest mismatch | Reject + log ALERT |
| 6 | Expired policy | Reject + log WARNING |
| 7 | Unsupported schema | Reject + log ERROR |
| 8 | Broken previous-policy link | Reject + log ALERT |
| 9 | Wrong organization/node group | Reject + log ALERT |
| 10 | Emergency minimum sequence not met | Reject + log ALERT |

No silent acceptance. No fallback to permissive mode.

## Full Snapshots vs Deltas

### POLICY_SNAPSHOT

A complete signed policy state. Contains everything a node needs to enforce authorization.

```typescript
type PolicySnapshot = {
  type: "POLICY_SNAPSHOT"
  envelope: SignedPolicyEnvelope
  content: {
    rules: PolicyRule[]
    capabilities: CapabilityTemplate[]
    constraints: PolicyConstraint[]
    metadata: PolicyMetadata
  }
}
```

A node receiving a snapshot:
1. Verify envelope signature
2. Verify all acceptance conditions
3. Replace local policy state entirely
4. Update `acceptedSequence` to envelope sequence
5. Store `previousPolicyDigest` for chain validation

### POLICY_DELTA

A signed incremental change to policy state.

```typescript
type PolicyDelta = {
  type: "POLICY_DELTA"
  envelope: SignedPolicyEnvelope
  basePolicyDigest: string       // SHA-256 of the policy this delta applies to
  resultPolicyDigest: string     // SHA-256 of the policy after applying this delta
  sequence: number
  operations: PolicyOperation[]
}

type PolicyOperation =
  | { op: "add_rule"; rule: PolicyRule }
  | { op: "remove_rule"; ruleId: string }
  | { op: "update_rule"; ruleId: string; patch: Partial<PolicyRule> }
  | { op: "add_capability"; capability: CapabilityTemplate }
  | { op: "remove_capability"; capabilityId: string }
  | { op: "update_constraint"; constraintId: string; patch: Partial<PolicyConstraint> }
```

A node receiving a delta:
1. Verify envelope signature
2. Verify all acceptance conditions
3. Check `basePolicyDigest` matches local policy digest
4. If match: apply operations, verify `resultPolicyDigest`
5. If mismatch: **reject delta → request full signed snapshot**

### Delta Failure Rule

```
DeltaReceived(d) ∧ d.basePolicyDigest ≠ LocalPolicyDigest
  → RejectDelta(d)
  → RequestFullSnapshot(issuerId)
  → Never attempt to apply delta to uncertain state
```

This is non-negotiable. Applying a delta to wrong base state produces incorrect policy.

## Synchronization Protocol

### Online Synchronization

```
Node → Issuer: PolicySyncRequest { lastAcceptedSequence, lastPolicyDigest }
Issuer → Node: PolicySyncResponse { snapshot | delta[] | "up_to_date" }
```

If the node's `lastAcceptedSequence` is within the issuer's delta retention window:
- Issuer sends deltas from `lastAcceptedSequence + 1` to current
- Node applies deltas sequentially, verifying each `basePolicyDigest`

If the node's `lastAcceptedSequence` is outside the delta retention window:
- Issuer sends full snapshot
- Node replaces local state entirely

### Periodic Refresh

Online nodes should refresh policy every **5 minutes** (configurable).

```
while (node.isOnline) {
  await refreshPolicy()
  await sleep(POLICY_REFRESH_INTERVAL)
}
```

### Reconnection Synchronization

When a node reconnects after offline period:
1. Send `PolicySyncRequest` with current state
2. Receive deltas or snapshot
3. Apply and verify
4. Transition to ONLINE only after successful sync

## Emergency Policy Propagation

For critical policy changes (e.g., compromised node, revoked authority):

```
type EmergencyPolicyUpdate = {
  type: "EMERGENCY_POLICY"
  envelope: SignedPolicyEnvelope
  minimumSequence: number      // nodes below this sequence are non-compliant
  deadline: string             // ISO 8601 — nodes must accept by this time
  reason: string
}
```

Emergency updates bypass normal refresh intervals. All nodes must process within **5 minutes** or transition to QUARANTINED.

## Policy Digest Computation

```
policyDigest = SHA-256(canonicalJSON({
  policyId,
  policyVersion,
  rules: [...sorted by ruleId],
  capabilities: [...sorted by capabilityId],
  constraints: [...sorted by constraintId],
  metadata,
}))
```

- Keys sorted alphabetically
- Arrays sorted by ID
- No whitespace
- Deterministic: same policy content → same digest

## Chain Validation

The `previousPolicyDigest` field creates a tamper-evident chain:

```
Policy₀ → Policy₁ → Policy₂ → ... → Policyₙ
  digest₀   digest₁   digest₂          digestₙ

Policy₁.previousPolicyDigest = digest₀
Policy₂.previousPolicyDigest = digest₁
```

A node can verify the entire chain by walking backward from the current policy. Any insertion, deletion, or modification breaks the chain.

## Security Properties

- **No silent policy acceptance**: All 10 rejection conditions checked
- **No delta application to uncertain state**: Mismatch → snapshot request
- **Tamper-evident chain**: `previousPolicyDigest` links all policies
- **Emergency propagation**: 5-minute hard deadline
- **Deterministic digest**: Same content → same hash
- **Sequence monotonicity**: No rollback possible
- **Epoch protection**: Old-epoch policies rejected immediately
