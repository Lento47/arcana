# Phase D Implementation Roadmap

> Phase D Architecture — Implementation Document
> Status: ROADMAP (not implemented)
> Created: 2026-07-29

## Implementation Order

Start below the network layer. Deterministic cryptographic and state-machine primitives first. Transport last.

### D-1: Canonical Signed Envelopes

Implement:
- `SignedCapabilityEnvelope`
- `SignedPolicyEnvelope`
- `NodeIdentityCertificate`
- `RevocationStatement`

Requirements:
- Exact canonical serialization
- Domain-separated signature inputs
- Ed25519 signing and verification
- Strict schema versions
- Duplicate-field rejection
- Unknown-field policy
- Golden test vectors
- Byte-identical repeatability

Domain separation strings:
```
arcana:signed-capability:v1
arcana:signed-policy:v1
arcana:node-identity:v1
arcana:revocation:v1
```

### D-2: Golden Ed25519 Vectors

Create deterministic test vectors for:
- Known key pair (not random per test run)
- Known canonical payload
- Known signature
- Known invalid signature (for rejection tests)

Vectors must be byte-identical across runtimes and platforms.

### D-3: Pure Verification

Build pure functions:
- `verifySignedCapability(...)`
- `verifySignedPolicy(...)`
- `verifyNodeIdentity(...)`
- `verifyRevocationStatement(...)`

They must not access networks or databases.

Return structured rejection reasons:
```
INVALID_SIGNATURE
UNKNOWN_ISSUER
ISSUER_EPOCH_TOO_OLD
WRONG_AUDIENCE
EXPIRED
SEQUENCE_ROLLBACK
DIGEST_MISMATCH
SCHEMA_UNSUPPORTED
ANCESTRY_INVALID
REVOKED
```

### D-4: Policy and Revocation State Reducers

Implement pure reducers for:
- Node trust lifecycle
- Policy synchronization
- Revocation synchronization
- Offline enforcement transitions
- Grant delegation ancestry

Same inputs plus same state must always produce the same transition.

### D-5: Offline-Mode Transition Tests

Test all valid and invalid combinations from the `NodeRuntimeState` table:
- TRUSTED + ONLINE + CURRENT → normal
- TRUSTED + OFFLINE + STALE → restricted
- REVOKED + any + any → QUARANTINED
- TRUSTED + ONLINE + QUARANTINED + CURRENT → invalid (no quarantine cause)

## Phase D First Implementation Gate

| Gate | Status |
|------|--------|
| Canonical envelopes deterministic | PENDING |
| Golden signature vectors | PENDING |
| Wrong audience rejected | PENDING |
| Old issuer epoch rejected | PENDING |
| Sequence rollback rejected | PENDING |
| Policy delta base mismatch rejected | PENDING |
| Expired grant rejected | PENDING |
| Revoked grant rejected | PENDING |
| Offline authority never increases | PENDING |
| Quarantined node consequential effects | 0 |

## Parallel-Track Ownership

### TUI-2 Owns

- `ApprovalInteractionView`
- `ApprovalOperatorCommand`
- Approval panel and inspector
- Keyboard interaction
- Durable-state rendering
- TUI integration tests

### Phase D Owns

- Signed envelopes
- Node identity
- Issuer trust
- Policy/revocation synchronization
- Offline enforcement
- Distributed proof types
- Cryptographic test vectors

### Shared Schema Changes

Any modification to public governance schemas should be isolated in a dedicated commit that can be cherry-picked into both branches.

**Avoid independently editing `governance-views.ts` in both tracks.**

## TUI-2 First Vertical Slice

```
approval required
→ inspect
→ approve once or deny
→ fresh PDP/PEP evaluation
→ execute or remain denied
→ approval consumed
→ receipt and RunProof update
```

No change scope in this initial slice. Validate the exact approve/deny lifecycle end to end.

## TUI-2 Decisive Tests

| # | Test | Assertion |
|---|------|-----------|
| 1 | Exact approval executes once | executor called exactly 1 time |
| 2 | Denial produces zero executor calls | executor called 0 times |
| 3 | Changed request hash produces STALE | result.status = "STALE" |
| 4 | Changed contract revision produces STALE | result.status = "STALE" |
| 5 | Approval expires while panel open | result.status = "EXPIRED" |
| 6 | Two TUI instances approve concurrently | one wins, one gets ALREADY_DECIDED |
| 7 | TUI crashes after submit, reopens | displays durable state, not optimistic |
| 8 | Capability revoked after approval | fresh PEP denies execution |
| 9 | Approval consumed, second attempt | cannot execute again |
| 10 | Approval store unavailable | TUI shows failure, no effect |
| 11 | Sensitive values redacted | no secrets in panel/inspector/receipts/errors |
| 12 | Header and RunProof update | after execution, assurance reflects new state |
| 13 | Filter cannot hide pending approval | visible indicator when filtered |
| 14 | Resize preserves approval identity | selected action stable across widths |
| 15 | Wrong session cannot approve | cross-session approval rejected |

## Hard Gates

| Gate | Count |
|------|-------|
| Button-to-effect direct paths | 0 |
| Executor calls after operator denial | 0 |
| Stale approvals accepted | 0 |
| Duplicate approval executions | 0 |
| Cross-session approvals | 0 |
| Secret leaks | 0 |

## TUI Responsibility Boundary

The TUI issues an operator intent, not authorization itself:

```
TUICommand
  → ScopedApprovalService
  → DurableApprovalTransition
  → FreshPDP/PEP
  → Effect
```

Never:
```
ApproveButton → Effect
```

The TUI has no direct access to:
- Executor callbacks
- Capability-store mutation
- Approval row mutation
- PDP internals
- Secret material

## Recommended Next Sprint

### TUI-2

| Work Package | Description |
|-------------|-------------|
| TUI-2A | Approval interaction state machine |
| TUI-2B | Approval panel + exact request inspector |
| TUI-2C | Approve-once and deny command service binding |
| TUI-2D | Real PEP execution and receipt refresh |
| TUI-2E | Stale, concurrency, recovery, and redaction tests |

### Phase D

| Work Package | Description |
|-------------|-------------|
| D-1 | Canonical signed-envelope types |
| D-2 | Golden Ed25519 vectors |
| D-3 | Pure verifier and rejection registry |
| D-4 | Policy and revocation state reducers |
| D-5 | Offline-mode transition tests |
