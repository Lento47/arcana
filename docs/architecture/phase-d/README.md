# Phase D: Distributed Authority Architecture

**Status:** Design-only track  
**Branch:** `phase-d-distributed-authority-design`  
**Prerequisite:** Phase C freeze (`arcana-governed-autonomy-phase-c`)

## Overview

Phase D extends Arcana's local governed autonomy to distributed nodes. A node is an Arcana Runtime instance that enforces Phase C policies locally and synchronizes authority with a control plane.

## Design Documents

| Document | Status | Description |
|----------|--------|-------------|
| [threat-model.md](threat-model.md) | Draft | Threat surface for distributed authority |
| [node-identity.md](node-identity.md) | Draft | What identifies an Arcana Node |
| [signed-grants.md](signed-grants.md) | Draft | Grant signing and verification |
| [revocation-protocol.md](revocation-protocol.md) | Draft | How revocation propagates |
| [policy-synchronization.md](policy-synchronization.md) | Draft | How policy versions sync |
| [offline-enforcement.md](offline-enforcement.md) | Draft | What happens while a node is offline |
| [node-registration.md](node-registration.md) | Draft | Node registration and attestation |
| [proof-synchronization.md](proof-synchronization.md) | Draft | How RunProofs compose centrally |
| [cross-node-runproof.md](cross-node-runproof.md) | Draft | Cross-node proof composition |
| [protocol-state-machines.md](protocol-state-machines.md) | Draft | Protocol state machines |

## Key Design Questions

1. What identifies an Arcana Node?
2. Who may issue grants?
3. How are grants signed and verified?
4. How short-lived are grants?
5. How does revocation propagate?
6. What happens while a node is offline?
7. Which policy version wins?
8. How are node events ordered?
9. How are local RunProofs composed centrally?
10. What happens when a node is compromised?

## Architecture Principle

Phase D wraps and extends the validated Phase C kernel. The local PDP/PEP is not redesigned — it is extended with:
- Signed grant verification
- Node identity attestation
- Remote revocation checking
- Cross-node proof composition

```
Phase C (local)
├── PDP (pure function)
├── PEP (enforcement)
├── Grant Store (SQLite)
├── Scoped Approvals
├── Intent Bindings
├── RunProof
└── Event Store

Phase D (distributed)
├── Phase C (unchanged)
├── Node Identity
├── Grant Signer
├── Grant Verifier
├── Revocation Checker
├── Policy Sync
├── Event Sync
├── Proof Composer
└── Control Plane Client
```

## Trust Boundaries

```
Control Plane (trusted)
    │
    │ signed grants + revocation lists
    │
    ▼
Arcana Node (semi-trusted)
    │
    │ local enforcement
    │
    ▼
Sandbox (untrusted)
```

The control plane is the sole authority for:
- Issuing signed grants
- Publishing revocation lists
- Synchronizing policy versions
- Composing cross-node RunProofs

A node is semi-trusted:
- It enforces Phase C policies locally
- It verifies grant signatures before enforcement
- It checks revocation lists before execution
- It cannot self-authorize beyond its signed grants
