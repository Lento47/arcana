# Distributed Revocation Protocol

> Phase D Architecture — Design Document
> Status: DESIGN (not implemented)
> Created: 2026-07-29

## Purpose

Define how capability grants are revoked across distributed Arcana Nodes, ensuring that revoked authority cannot be exercised even by offline nodes.

## Design Questions (Frozen)

### Push vs Pull Propagation

**Decision: Push primary, pull fallback**

- **Push**: Issuer broadcasts revocation to all known nodes immediately
- **Pull**: Nodes periodically poll the issuer for revocation updates
- **Emergency**: Push with exponential backoff retry

Push ensures fast propagation (sub-second for online nodes). Pull ensures offline nodes eventually learn about revocations when they reconnect.

### Revocation Sequence Numbers

**Decision: Monotonic sequence per issuer**

```
type RevocationEntry = {
  grantId: string
  sequence: number        // monotonic per issuer
  revokedAt: string       // ISO 8601
  revokedBy: string       // principal ID of revoker
  reason: string          // human-readable reason
  cascade: boolean        // whether to revoke child grants
}
```

Each issuer maintains a monotonic sequence number. Nodes track the highest sequence they've seen. If a node's last-known sequence is N, it requests all revocations with sequence > N on reconnect.

### Node Acknowledgement

**Decision: Acknowledged push with retry**

```
Issuer → Node: RevocationNotification { entries: [...], sequence: N }
Node → Issuer: RevocationAck { nodeId, highestSequence: N }
```

If the issuer doesn't receive an ack within 30 seconds, it retries with exponential backoff (30s, 60s, 120s, 240s, max 10 retries).

After 10 retries, the node is marked as "potentially stale" in the trust registry.

### Offline-Node Behavior

**Decision: Short-lived grants + pull on reconnect**

When an offline node reconnects:
1. Send `RevocationPullRequest { lastKnownSequence }` to issuer
2. Receive all revocations since `lastKnownSequence`
3. Apply revocations locally
4. Reject any grants that are now revoked

The maximum stale window is the grant lifetime (1 hour default). Since grants expire quickly, the worst case is a 1-hour window of stale authority.

### Maximum Stale Window

**Decision: 1 hour (matches grant lifetime)**

```
maxStaleWindow = min(grantLifetime, maxOfflineValidity)
```

If a node has been offline for longer than the stale window, ALL its grants are considered expired and must be re-requested.

### Emergency Global Revocation

**Decision: Emergency revocation broadcast**

```
type EmergencyRevocation = {
  type: "EMERGENCY_REVOCATION"
  targetNodeId: string    // node to revoke all grants for
  reason: string
  issuedAt: string
  signature: string       // signed by trust registry authority
}
```

Emergency revocation revokes ALL grants issued by a specific node. Used when:
- Node compromise detected
- Issuer key suspected leaked
- Operator manual override

All nodes must process emergency revocations within 5 minutes. Nodes that don't ack within 5 minutes are marked as untrusted.

### Issuer Key Compromise

**Decision: Epoch bump + emergency revocation**

When an issuer key is compromised:
1. Trust registry bumps the issuer's epoch
2. Emergency revocation issued for all grants at old epoch
3. All nodes must re-authenticate with the issuer
4. New grants issued with new epoch
5. Old grants rejected immediately (epoch check fails)

### Parent Capability Cascade

**Decision: Cascade on revocation by default**

When a parent grant is revoked:
1. Parent grant status → REVOKED
2. All child grants (grants with `parentGrantId = revokedGrantId`) → REVOKED
3. All grandchild grants → REVOKED
4. Continue recursively

This matches the local Phase C `cascadeRevocation` behavior.

**Exception**: If `cascade: false` in the revocation entry, only the specific grant is revoked. Child grants remain valid until their own expiry or explicit revocation.

### Conflict Resolution

**Decision: Last-write-wins with sequence numbers**

If two revocation entries conflict (e.g., same grant revoked twice):
- Higher sequence number wins
- If same sequence (different issuers), the trust registry authority wins

If a grant is revoked and then re-granted:
- Re-grant must have a new `grantId`
- Old grant remains revoked
- Nonce uniqueness prevents replay

### Clock Skew Tolerance

**Decision: 5-minute skew tolerance + monotonic sequences**

```
clockSkewTolerance = 5 minutes
```

- Grant freshness checks allow 5 minutes of clock skew
- Revocation sequence numbers are monotonic (not time-based)
- Nodes reject grants with `issuedAt` more than 5 minutes in the future

For time-critical operations (emergency revocation), nodes use the issuer's timestamp, not local time.

## Revocation Flow

### Normal Revocation

```
1. Operator revokes grant on issuer node
2. Issuer creates RevocationEntry { grantId, sequence: N+1 }
3. Issuer signs revocation entry
4. Issuer pushes to all connected nodes
5. Each node verifies signature
6. Each node applies revocation locally
7. Each node sends RevocationAck
8. Issuer marks revocation as confirmed
```

### Emergency Revocation

```
1. Operator triggers emergency revocation
2. Trust registry creates EmergencyRevocation { targetNodeId }
3. Trust registry signs with emergency key
4. Broadcast to all nodes (push + pull)
5. All nodes immediately revoke all grants from target node
6. All nodes send ack within 5 minutes
7. Nodes that don't ack are marked untrusted
```

### Offline Reconnect

```
1. Node reconnects after offline period
2. Node sends RevocationPullRequest { lastKnownSequence }
3. Issuer sends all revocations since lastKnownSequence
4. Node applies revocations
5. Node sends RevocationAck
6. Node re-requests any expired grants
```

## Security Properties

- **No stale authority beyond grant lifetime**: Grants expire in 1 hour max
- **Fast propagation for online nodes**: Sub-second push
- **Bounded stale window for offline nodes**: 1 hour max
- **Cascade prevents authority escape**: Revoking parent revokes all children
- **Emergency revocation is immediate**: 5-minute hard deadline
- **Clock skew tolerance**: 5 minutes, monotonic sequences for ordering
- **No replay**: Nonce uniqueness + sequence numbers
