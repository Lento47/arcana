# Protocol State Machines

> Phase D Architecture — Design Document
> Status: DESIGN (not implemented)
> Created: 2026-07-29

## Purpose

Define the state machines for distributed protocol operations: grant signing, revocation propagation, policy synchronization, and node trust management.

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

## Composite State: Node Lifecycle

A node's state is the combination of all state machines:

```typescript
type NodeLifecycleState = {
  trust: "UNKNOWN" | "TRUSTED" | "REVOKED" | "EXPIRED" | "REINSTATED"
  connectivity: "ONLINE" | "OFFLINE_RESTRICTED" | "OFFLINE_READ_ONLY" | "QUARANTINED"
  policy: "SYNCHRONIZED" | "STALE" | "SYNCING" | "SYNC_FAILED" | "RETRY" | "QUARANTINED"
  revocation: "PENDING" | "BROADCAST" | "ACKNOWLEDGED" | "CONFIRMED" | "RETRY" | "TIMEOUT"
}
```

### Valid Combinations

| Trust | Connectivity | Policy | Revocation | Valid |
|-------|-------------|--------|------------|-------|
| TRUSTED | ONLINE | SYNCHRONIZED | CONFIRMED | ✅ normal |
| TRUSTED | OFFLINE_RESTRICTED | STALE | CONFIRMED | ✅ temporary |
| TRUSTED | OFFLINE_READ_ONLY | STALE | TIMEOUT | ✅ degraded |
| REVOKED | QUARANTINED | QUARANTINED | — | ✅ revoked |
| UNKNOWN | any | any | — | ❌ must evaluate trust first |
| TRUSTED | ONLINE | QUARANTINED | — | ❌ inconsistent |
| REVOKED | ONLINE | SYNCHRONIZED | — | ❌ revoked but online |

### Invariant

```
ValidNodeState(n) ⟺
  (n.trust = TRUSTED ∧ n.connectivity ≠ QUARANTINED)
  ∨ (n.trust = REVOKED ∧ n.connectivity = QUARANTINED)
  ∨ (n.trust = UNKNOWN ∧ n.connectivity = QUARANTINED)
```
