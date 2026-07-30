# Offline Enforcement

> Phase D Architecture — Design Document
> Status: DESIGN (not implemented)
> Created: 2026-07-29

## Purpose

Define how Arcana Nodes enforce authorization when disconnected from the issuer, ensuring that disconnection never increases authority.

## Node Connectivity Modes

```typescript
type NodeConnectivityMode =
  | "ONLINE"
  | "OFFLINE_RESTRICTED"
  | "OFFLINE_READ_ONLY"
  | "QUARANTINED"
```

## Mode Behaviors

### ONLINE

Current policy and revocation state. Normal local Phase C enforcement.

```
ONLINE →
  CurrentPolicy
  ∧ CurrentRevocationState
  → NormalLocalPhaseCEnforcement
```

All capabilities, approvals, delegations, and evidence operations available.

### OFFLINE_RESTRICTED

Policy/revocation freshness within lease. Only explicitly offline-enabled capabilities available.

```
OFFLINE_RESTRICTED →
  PolicyLeaseFresh
  ∧ RevocationLeaseFresh
  → OnlyOfflineEnabledCapabilities
  → NoNewlyIssuedBroadAuthority
```

Restrictions:
- Only grants with `offlineEnabled: true` are usable
- No new broad authority grants (only narrow, pre-authorized)
- No new delegations
- No new approvals
- Existing approvals continue within their lifetime

### OFFLINE_READ_ONLY

Freshness outside consequential-action window. Bounded reads only.

```
OFFLINE_READ_ONLY →
  PolicyLeaseExpired
  ∨ RevocationLeaseExpired
  → ReadOnlyAccess
  → NoWrites
  → NoExecution
  → NoNetworkMutation
  → NoSecrets
  → NoDelegation
```

Restrictions:
- `filesystem.read` only (no write, no execute)
- No `process.execute`
- No `network.write`
- No `secret.read`
- No `git.push`
- No delegation
- No approval creation or consumption

### QUARANTINED

Invalid identity, unknown issuer epoch, broken policy chain, or excessive stale state.

```
QUARANTINED →
  IdentityInvalid
  ∨ UnknownIssuerEpoch
  ∨ BrokenPolicyChain
  ∨ ExcessiveStaleState
  → NoConsequentialEffects
```

Restrictions:
- No effects at all
- Node can only request synchronization
- Node can only display its current state
- Node cannot authorize any action

## Core Invariant

```
OfflineExecution(q) ⟺
  OfflinePermitted(grant)
  ∧ PolicyLeaseFresh
  ∧ RevocationLeaseFresh
  ∧ LocalPhaseCConditions(q)
```

A node being disconnected must never increase its authority.

## Monotonic Time

Wall-clock time can move backward or be manipulated. Lease enforcement uses monotonic elapsed time.

```typescript
type OfflineLeaseState = {
  acceptedAtWallClock: string    // ISO 8601 — for audit only
  acceptedAtMonotonic: number    // monotonic milliseconds — for enforcement
  maximumOfflineDurationMs: number
}
```

Lease freshness check:

```
PolicyLeaseFresh ⟺
  monotonicNow() - acceptedAtMonotonic < maximumOfflineDurationMs
```

The wall clock remains useful for audit, but lease enforcement uses monotonic elapsed time where the OS supports it.

## Required State Transitions

```
ONLINE
  → connection lost
  → OFFLINE_RESTRICTED

OFFLINE_RESTRICTED
  → revocation freshness expires
  → OFFLINE_READ_ONLY

OFFLINE_READ_ONLY
  → policy expires
  → QUARANTINED

OFFLINE_READ_ONLY
  → identity becomes uncertain
  → QUARANTINED

Any offline state
  → verified synchronization completes
  → ONLINE
```

### Transition Diagram

```
         connection lost
ONLINE ──────────────────→ OFFLINE_RESTRICTED
  ↑                              │
  │                              │ revocation freshness expires
  │                              ↓
  │                        OFFLINE_READ_ONLY
  │                              │
  │                              │ policy expires / identity uncertain
  │                              ↓
  │                          QUARANTINED
  │                              │
  └──────────────────────────────┘
         verified synchronization
```

## Recovery Requirements

Transition from any offline state to ONLINE requires all of:

1. **Node identity still valid** — certificate not expired, not revoked
2. **Issuer epoch acceptable** — `issuerEpoch ≥ minimumIssuerEpoch`
3. **Current complete policy snapshot** — full snapshot received and verified
4. **Revocation sequence caught up** — all revocations since last-known sequence applied
5. **Missing event/proof ranges synchronized** — event chain is complete

Recovery is not automatic. The node must actively request synchronization and pass all checks.

## Offline Lease Configuration

```typescript
type OfflineLeaseConfig = {
  // Maximum duration a node can remain offline before QUARANTINED
  maxOfflineDurationMs: number          // default: 24 hours

  // Maximum duration before transitioning from RESTRICTED to READ_ONLY
  maxConsequentialOfflineMs: number     // default: 1 hour

  // Maximum duration before policy must be refreshed
  policyLeaseMs: number                 // default: 1 hour

  // Maximum duration before revocation state must be refreshed
  revocationLeaseMs: number             // default: 30 minutes

  // Grace period after lease expires before transition
  leaseGraceMs: number                  // default: 5 minutes
}
```

## Offline-Enabled Grants

Grants can be marked as `offlineEnabled`:

```typescript
type OfflineCapableGrant = CapabilityGrant & {
  offlineEnabled: boolean
  offlineMaxDurationMs?: number    // overrides global config
}
```

Only grants with `offlineEnabled: true` are usable in OFFLINE_RESTRICTED mode. This allows fine-grained control over what a disconnected node can do.

## Clock Skew Handling

```
clockSkewTolerance = 5 minutes
```

- Policy `issuedAt` and `expiresAt` allow 5 minutes of clock skew
- Lease enforcement uses monotonic time (immune to clock skew)
- Audit timestamps use wall clock with skew annotation

## Security Properties

- **Disconnection never increases authority**: Core invariant
- **Monotonic time for leases**: Immune to clock manipulation
- **Progressive restriction**: ONLINE → RESTRICTED → READ_ONLY → QUARANTINED
- **Recovery requires full synchronization**: No automatic re-entry to ONLINE
- **Offline-enabled grants are explicit**: Opt-in per grant
- **No silent mode transitions**: All transitions logged
- **Grace periods prevent flapping**: Brief connectivity issues don't trigger transitions
