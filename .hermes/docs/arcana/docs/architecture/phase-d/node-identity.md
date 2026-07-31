# Phase D: Node Identity

## What Identifies an Arcana Node?

An Arcana Node is identified by a cryptographic key pair:
- **Node ID:** SHA-256 hash of the node's public key
- **Node Public Key:** Ed25519 public key
- **Node Private Key:** Ed25519 private key (hardware-backed where available)

## Node Identity Lifecycle

```
Registration → Attestation → Active → Suspended → Revoked
```

### Registration
1. Node generates Ed25519 key pair
2. Node sends registration request to control plane
3. Control plane verifies node attestation
4. Control plane issues node certificate
5. Node stores certificate locally

### Attestation
Node attestation proves:
- Node is running a valid Arcana Runtime version
- Node's Phase C enforcement is active
- Node's grant store is empty (fresh start) or contains only valid grants
- Node's event chain is intact

Attestation methods:
- **Software attestation:** Runtime version hash + enforcement status
- **Hardware attestation:** TPM/Secure Enclave where available
- **Manual attestation:** Operator approves node registration

### Active State
- Node has valid certificate
- Node can receive signed grants
- Node can execute authorized operations
- Node reports events to control plane

### Suspension
- Temporary revocation (e.g., network partition detected)
- Node retains existing grants but cannot receive new ones
- Node events are queued for later synchronization

### Revocation
- Permanent revocation (e.g., node compromised)
- All grants issued to the node are revoked
- Node certificate is added to revocation list
- All other nodes are notified

## Node Certificate Format

```json
{
  "version": "1",
  "nodeId": "sha256:abc123...",
  "publicKey": "ed25519:def456...",
  "attestation": {
    "method": "software",
    "runtimeVersion": "0.9.0",
    "runtimeHash": "sha256:ghi789...",
    "enforcementActive": true,
    "timestamp": "2026-07-30T00:00:00Z"
  },
  "issuedAt": "2026-07-30T00:00:00Z",
  "expiresAt": "2026-08-06T00:00:00Z",
  "issuer": "control-plane",
  "signature": "ed25519:jkl012..."
}
```

## Key Storage

| Environment | Storage | Notes |
|-------------|---------|-------|
| Development | File system | `~/.arcana/node-key.pem` |
| Production | TPM/Secure Enclave | Hardware-backed |
| Cloud | KMS | AWS KMS, GCP KMS, Azure Key Vault |
| Container | Volume mount | Encrypted at rest |

## Node Discovery

Nodes discover each other through the control plane:
- Node A requests grant delegation to Node B
- Control plane resolves Node B's identity
- Control plane facilitates signed grant exchange
- Nodes never directly exchange grants without control plane mediation
