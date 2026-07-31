# Protocol State Machines

> Phase D Architecture — Design Document
> Status: DESIGN (not implemented)
> Created: 2026-07-29
> Updated: 2026-07-29 — Independent axes, corrected emergency wording

## Purpose

Define the state machines for distributed protocol operations: grant signing, revocation propagation, policy synchronization, and node trust management.

## Node Runtime State

Identity status, connectivity status, policy freshness, and enforcement mode are **separate axes**. They compose independently.

```typescript
type NodeRuntimeState = {
  identity:
    | "UNREGISTERED"
    | "PENDING"
    | "TRUSTED"
    | "SUSPENDED"
    | "REVOKED"

  connectivity:
    | "ONLINE"
    | "OFFLINE"

  enforcement:
    | "ONLINE"
    | "OFFLINE_RESTRICTED"
    | "OFFLINE_READ_ONLY"
    | "QUARANTINED"

  policy:
    | "CURRENT"
    | "STALE"
    | "INVALID"
    | "UNAVAILABLE"

  revocation:
    | "CURRENT"
    | "STALE"
    | "INVALID"
    | "UNAVAILABLE"
}
```

## Independent Invariants

Each axis has its own invariant. They compose, but are not collapsed into a single compound expression.

### Identity Invariant

```
Trusted(node) ⟹ ¬Revoked(node)
Revoked(node) ⟹ Mode(node) = QUARANTINED
```

A trusted node is not revoked. A revoked node is quarantined. But a quarantined node is not necessarily identity-revoked — it may be quarantined because of stale policy, missing revocation updates, invalid clock state, broken proof synchronization, or unknown issuer epoch.

### Enforcement Invariant

```
Mode(node) = QUARANTINED ⟹ ¬ConsequentialEffects(node)
```

A quarantined node cannot produce consequential effects regardless of why it was quarantined.

### Execution Invariant

```
Effect_node(q) ⟹
  Trusted(node)
  ∧ ¬Revoked(node)
  ∧ Mode(node) ≠ QUARANTINED
  ∧ PolicyFresh(node)
  ∧ RevocationFresh(node)
```

All five conditions must be satisfied for a consequential effect. This is the primary gate.

### Policy Freshness Invariant

```
PolicyFresh(node) ⟹ node.policy ∈ {CURRENT}
```

Policy must be CURRENT. STALE, INVALID, or UNAVAILABLE all block consequential effects.

### Revocation Freshness Invariant

```
RevocationFresh(node) ⟹ node.revocation ∈ {CURRENT}
```

Revocation state must be CURRENT. STALE, INVALID, or UNAVAILABLE all block consequential effects.

## Valid Combinations

Not all combinations of axes are valid. The following table defines which composite states are coherent.

### Normal Operation

| Identity | Connectivity | Enforcement | Policy | Revocation | Valid |
|----------|-------------|-------------|--------|------------|-------|
| TRUSTED | ONLINE | ONLINE | CURRENT | CURRENT | ✅ |
| TRUSTED | ONLINE | ONLINE | STALE | CURRENT | ✅ degraded |
| TRUSTED | ONLINE | ONLINE | CURRENT | STALE | ✅ degraded |
| TRUSTED | OFFLINE | OFFLINE_RESTRICTED | STALE | CURRENT | ✅ restricted |
| TRUSTED | OFFLINE | OFFLINE_READ_ONLY | STALE | STALE | ✅ read-only |

### Quarantine States

| Identity | Connectivity | Enforcement | Policy | Revocation | Valid | Cause |
|----------|-------------|-------------|--------|------------|-------|-------|
| TRUSTED | OFFLINE | QUARANTINED | STALE | STALE | ✅ | stale leases |
| TRUSTED | OFFLINE | QUARANTINED | INVALID | CURRENT | ✅ | broken policy chain |
| TRUSTED | OFFLINE | QUARANTINED | UNAVAILABLE | UNAVAILABLE | ✅ | never synced |
| REVOKED | any | QUARANTINED | any | any | ✅ | identity revoked |
| SUSPENDED | any | QUARANTINED | any | any | ✅ | identity suspended |
| UNREGISTERED | any | QUARANTINED | any | any | ✅ | never registered |

### Invalid Combinations

| Identity | Connectivity | Enforcement | Policy | Revocation | Valid | Reason |
|----------|-------------|-------------|--------|------------|-------|--------|
| TRUSTED | ONLINE | QUARANTINED | CURRENT | CURRENT | ❌ | trusted + online + current = no quarantine cause |
| REVOKED | ONLINE | ONLINE | CURRENT | CURRENT | ❌ | revoked node cannot be online enforcement |
| UNREGISTERED | ONLINE | ONLINE | CURRENT | CURRENT | ❌ | unregistered cannot enforce |
| TRUSTED | ONLINE | OFFLINE_RESTRICTED | CURRENT | CURRENT | ❌ | online but offline enforcement |
| TRUSTED | OFFLINE | ONLINE | CURRENT | CURRENT | ❌ | offline but online enforcement |

### Valid Combination Rule

```
ValidState(s) ⟺
  // Identity must support enforcement mode
  (s.identity ∈ {TRUSTED} → s.enforcement ∈ {ONLINE, OFFLINE_RESTRICTED, OFFLINE_READ_ONLY, QUARANTINED})
  ∧ (s.identity ∈ {REVOKED, SUSPENDED, UNREGISTERED} → s.enforcement = QUARANTINED)
  // Connectivity must support enforcement mode
  ∧ (s.connectivity = ONLINE → s.enforcement ∈ {ONLINE, QUARANTINED})
  ∧ (s.connectivity = OFFLINE → s.enforcement ∈ {OFFLINE_RESTRICTED, OFFLINE_READ_ONLY, QUARANTINED})
  // Policy/revocation must support enforcement mode
  ∧ (s.enforcement = ONLINE → s.policy ∈ {CURRENT, STALE} ∧ s.revocation ∈ {CURRENT, STALE})
  ∧ (s.enforcement = OFFLINE_RESTRICTED → s.revocation = CURRENT)
  ∧ (s.enforcement = OFFLINE_READ_ONLY → s.policy ∈ {STALE} ∨ s.revocation ∈ {STALE})
```

## Emergency Revocation Wording

### What the Control Plane Can Guarantee

**Online reachable node → acknowledge emergency epoch within 5 minutes**

The control plane broadcasts an emergency epoch update. Online nodes that receive it must acknowledge within 5 minutes. This is an online-node acknowledgement objective.

**Disconnected node → local offline lease expires within bounded duration**

Under a network partition, the control plane cannot force a disconnected node to receive a revocation. The enforceable guarantee is:

1. HIGH/CRITICAL actions are denied when offline leases are stale
2. Offline grant and revocation leases for HIGH/CRITICAL actions must be at most 5 minutes
3. After lease expiry, the node transitions to QUARANTINED
4. Eventual quarantine if synchronization is not restored

### What the Control Plane Cannot Guarantee

- Instantaneous revocation propagation to disconnected nodes
- Sub-5-minute stale-authority window for nodes with long offline leases
- Forced synchronization under network partition

### Emergency Deadline Definition

```
EmergencyDeadline = 5 minutes (online-node acknowledgement objective)

For disconnected nodes:
  StaleAuthorityWindow = max(grantLease, revocationLease)
  If StaleAuthorityWindow > 5 minutes:
    HIGH/CRITICAL actions denied during gap
    Node transitions to QUARANTINED after lease expiry
```

To claim a maximum 5-minute stale-authority window, offline grant and revocation leases for HIGH/CRITICAL actions must also be at most 5 minutes.

## Grant Signing State Machine

```
DRAFT → SIGNED → ACTIVE → [EXPIRED | EXHAUSTED | REVOKED]
```

### States

| State | Description | Transitions |
|-------|-------------|-------------|
| DRAFT | Grant created but not yet signed | → SIGNED |
| SIGNED | Grant signed, not yet delivered to audience | → ACTIVE |
| ACTIVE | Grant delivered and usable | → EXPIRED, EXHAUSTED, REVOKED |
| EXPIRED | `expiresAt` reached | terminal |
| EXHAUSTED | `maxUses` consumed | terminal |
| REVOKED | Explicitly revoked | terminal |

### Transitions

```
DRAFT → SIGNED:
  SignGrant(grant, issuerKey)
  → SignedCapabilityEnvelope

SIGNED → ACTIVE:
  DeliverGrant(envelope, audienceNode)
  → AudienceNode verifies signature
  → AudienceNode accepts grant
  → Grant stored locally

ACTIVE → EXPIRED:
  monotonicNow() > grant.expiresAt
  → Grant status = EXPIRED
  → Emit capability.grant_expired event

ACTIVE → EXHAUSTED:
  grant.usesConsumed >= grant.maxUses
  → Grant status = EXHAUSTED
  → Emit capability.grant_exhausted event

ACTIVE → REVOKED:
  RevokeGrant(grantId, reason)
  → Grant status = REVOKED
  → Cascade to child grants
  → Emit capability.grant_revoked event
```

## Revocation Propagation State Machine

```
PENDING → BROADCAST → ACKNOWLEDGED → CONFIRMED
                ↓
            RETRY → BROADCAST (max 10 retries)
                ↓
            TIMEOUT → NODE_STALE
```

### States

| State | Description | Transitions |
|-------|-------------|-------------|
| PENDING | Revocation created, not yet broadcast | → BROADCAST |
| BROADCAST | Revocation sent to all nodes | → ACKNOWLEDGED, RETRY |
| ACKNOWLEDGED | All nodes confirmed receipt | → CONFIRMED |
| CONFIRMED | Revocation fully propagated | terminal |
| RETRY | Some nodes didn't ack, retrying | → BROADCAST, TIMEOUT |
| TIMEOUT | Max retries exceeded, some nodes stale | terminal |

### Transitions

```
PENDING → BROADCAST:
  BroadcastRevocation(entry, allNodes)
  → Start ack timer (30s)

BROADCAST → ACKNOWLEDGED:
  All nodes sent RevocationAck
  → entry.status = CONFIRMED

BROADCAST → RETRY:
  ack timer expired, some nodes didn't ack
  → Retry with exponential backoff (30s, 60s, 120s, 240s)
  → retryCount++

RETRY → BROADCAST:
  Backoff timer expired
  → BroadcastRevocation(entry, unackedNodes)

RETRY → TIMEOUT:
  retryCount >= 10
  → Mark unacked nodes as "potentially stale"
  → entry.status = TIMEOUT
```

## Policy Synchronization State Machine

```
SYNCHRONIZED → STALE → SYNCING → [SYNCHRONIZED | SYNC_FAILED]
                                  ↓
                            SYNC_FAILED → RETRY → SYNCING
                                  ↓
                            QUARANTINED
```

### States

| State | Description | Transitions |
|-------|-------------|-------------|
| SYNCHRONIZED | Policy current, all checks pass | → STALE |
| STALE | Policy refresh interval exceeded | → SYNCING |
| SYNCING | Active synchronization in progress | → SYNCHRONIZED, SYNC_FAILED |
| SYNC_FAILED | Synchronization failed | → RETRY, QUARANTINED |
| RETRY | Retrying synchronization | → SYNCING |
| QUARANTINED | Policy chain broken or identity invalid | terminal (manual recovery) |

### Transitions

```
SYNCHRONIZED → STALE:
  monotonicNow() - lastSync > POLICY_REFRESH_INTERVAL
  → node.policyState = STALE

STALE → SYNCING:
  InitiatePolicySync()
  → Send PolicySyncRequest to issuer
  → node.policyState = SYNCING

SYNCING → SYNCHRONIZED:
  Received valid snapshot or deltas
  → Applied successfully
  → Digest chain verified
  → node.policyState = SYNCHRONIZED

SYNCING → SYNC_FAILED:
  Invalid signature
  ∨ Digest mismatch
  ∨ Expired policy
  ∨ Network error
  → node.policyState = SYNC_FAILED

SYNC_FAILED → RETRY:
  retryCount < MAX_SYNC_RETRIES
  → Exponential backoff
  → node.policyState = RETRY

RETRY → SYNCING:
  Backoff timer expired
  → InitiatePolicySync()
  → node.policyState = SYNCING

SYNC_FAILED → QUARANTINED:
  retryCount >= MAX_SYNC_RETRIES
  ∨ Broken policy chain
  ∨ Identity invalid
  → node.policyState = QUARANTINED
```

## Node Trust State Machine

```
UNKNOWN → TRUSTED → [REVOKED | EXPIRED]
           ↑   ↓
      REINSTATED
```

### States

| State | Description | Transitions |
|-------|-------------|-------------|
| UNKNOWN | Node not yet evaluated | → TRUSTED |
| TRUSTED | Node identity verified, policy accepted | → REVOKED, EXPIRED |
| REVOKED | Node trust explicitly revoked | → REINSTATED |
| EXPIRED | Node certificate expired | → UNKNOWN |
| REINSTATED | Previously revoked node re-trusted | → TRUSTED |

### Transitions

```
UNKNOWN → TRUSTED:
  VerifyNodeIdentity(node)
  → Certificate valid
  → Issuer epoch acceptable
  → Policy snapshot accepted
  → node.trustState = TRUSTED

TRUSTED → REVOKED:
  RevokeNodeTrust(nodeId, reason)
  → All grants from this node revoked
  → Emergency policy propagation
  → node.trustState = REVOKED

TRUSTED → EXPIRED:
  node.certificate.expiresAt < now
  → node.trustState = EXPIRED
  → Grace period: 1 hour
  → After grace: QUARANTINE all grants

REVOKED → REINSTATED:
  Manual operator action
  → New identity verification
  → New policy snapshot
  → node.trustState = REINSTATED
  → New issuer epoch
```

## Delegation Chain State Machine

```
PENDING → ACTIVE → [REVOKED | EXPIRED | EXHAUSTED]
           ↓
      CASCADE_REVOKED (parent revoked)
```

### States

| State | Description | Transitions |
|-------|-------------|-------------|
| PENDING | Child grant created, not yet activated | → ACTIVE, REVOKED |
| ACTIVE | Child grant usable | → REVOKED, EXPIRED, EXHAUSTED, CASCADE_REVOKED |
| REVOKED | Explicitly revoked | terminal |
| EXPIRED | Lifetime exceeded | terminal |
| EXHAUSTED | Uses consumed | terminal |
| CASCADE_REVOKED | Parent revoked, cascade applied | terminal |

### Transitions

```
PENDING → ACTIVE:
  Child session confirmed
  → Grant status = ACTIVE

ACTIVE → CASCADE_REVOKED:
  Parent grant revoked
  → BFS traversal of child grants
  → All descendants → CASCADE_REVOKED
  → Emit delegation.cascade events

ACTIVE → REVOKED:
  Explicit revocation
  → Cascade to children
  → Grant status = REVOKED
```

## Offline Mode State Machine

```
ONLINE → OFFLINE_RESTRICTED → OFFLINE_READ_ONLY → QUARANTINED
  ↑                                                    │
  └────────────────────────────────────────────────────┘
              verified synchronization
```

### States

| State | Description | Transitions |
|-------|-------------|-------------|
| ONLINE | Connected, current policy | → OFFLINE_RESTRICTED |
| OFFLINE_RESTRICTED | Disconnected, lease fresh | → OFFLINE_READ_ONLY, ONLINE |
| OFFLINE_READ_ONLY | Disconnected, lease stale | → QUARANTINED, ONLINE |
| QUARANTINED | Identity/policy invalid | → ONLINE (manual) |

### Transitions

```
ONLINE → OFFLINE_RESTRICTED:
  Connection lost
  → Start offline timer (monotonic)
  → node.mode = OFFLINE_RESTRICTED

OFFLINE_RESTRICTED → OFFLINE_READ_ONLY:
  revocationLease expired
  ∨ consequentialOfflineMs exceeded
  → node.mode = OFFLINE_READ_ONLY

OFFLINE_READ_ONLY → QUARANTINED:
  policyLease expired
  ∨ identity uncertain
  ∨ maxOfflineDuration exceeded
  → node.mode = QUARANTINED

Any → ONLINE:
  Verified synchronization complete
  → Policy snapshot accepted
  → Revocation sequence caught up
  → Identity valid
  → node.mode = ONLINE
```
