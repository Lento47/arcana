# Phase D Threat Model

## Threat Surface

### T1 — Compromised Node
**Attack:** Attacker gains control of an Arcana Node.  
**Impact:** Node could self-authorize beyond granted capabilities.  
**Mitigation:** Grant signatures verified against control plane public key. Node cannot forge grants. Revocation list checked before every execution.

### T2 — Stolen Node Identity
**Attack:** Attacker extracts node identity key.  
**Impact:** Attacker can impersonate the node.  
**Mitigation:** Short-lived node attestation tokens. Hardware-backed key storage where available. Revocation of compromised node identities.

### T3 — Replay Attack on Grants
**Attack:** Attacker captures a signed grant and replays it after revocation.  
**Impact:** Revoked grant still usable.  
**Mitigation:** Grant expiry (short-lived). Revocation list checked before enforcement. Grant nonce prevents replay.

### T4 — Control Plane Compromise
****Attack:** Attacker gains control of the control plane.  
**Impact:** Can issue arbitrary grants, revoke legitimate grants.  
**Mitigation:** Multi-sig for grant issuance. Audit trail on all control plane operations. Node-level policy overrides for critical operations.

### T5 — Network Partition
**Attack:** Node loses connectivity to control plane.  
**Impact:** Node cannot check revocation lists or get new grants.  
**Mitigation:** Offline enforcement mode with cached grants. Graceful degradation — node falls back to local-only authority. Stale grants expire automatically.

### T6 — Event Ordering Manipulation
**Attack:** Attacker reorders or drops events between node and control plane.  
**Impact:** Control plane has incorrect view of node state.  
**Mitigation:** Event sequence numbers. Merkle-chain event ordering. Tamper-evident event log.

### T7 — Grant Amplification
**Attack:** Node delegates more authority than it received.  
**Impact:** Child node has capabilities beyond parent.  
**Mitigation:** Grant signing includes parent grant hash. Delegation depth enforced at signature verification time. Cannot sign a grant broader than the signer's own authority.

### T8 — Revocation Window
**Attack:** Attacker exploits the time between revocation and propagation.  
**Impact:** Revoked grant still usable on nodes that haven't received revocation.  
**Mitigation:** Short grant expiry (minutes, not hours). Push-based revocation propagation. Revocation acknowledgment required.

### T9 — Cross-Node Proof Forgery
**Attack:** Attacker forges a RunProof from a different node.  
**Impact:** False assurance about remote execution.  
**Mitigation:** RunProofs signed by originating node. Cross-node proof composition verifies signatures. Control plane validates proof chain.

### T10 — Offline Node Drift
**Attack:** Node operates offline for extended period with stale policy.  
**Impact:** Node enforces outdated policy.  
**Mitigation:** Grant expiry forces re-authorization. Policy version checked on reconnection. Stale policy triggers degraded assurance mode.

## Trust Levels

| Component | Trust Level | Notes |
|-----------|-------------|-------|
| Control Plane | Trusted | Sole grant issuer |
| Node Identity | Semi-trusted | Verified by attestation |
| Local PDP/PEP | Trusted (Phase C) | Validated by 95 adversarial fixtures |
| Grant Store | Semi-trusted | Backed by SQLite, verified by signature |
| Network | Untrusted | All messages signed |
| Sandbox | Untrusted | Capability-restricted |
| Event Store | Semi-trusted | Tamper-evident chain |
