# Phase C: Capability Security Runtime

**Branch**: `phase-c-capability-security`
**Forked from**: `arcana-epistemic-runtime-phase-b` (`8a7b007a`)
**Date**: 2026-07-28

## Hard Invariant

```
∀ q ∈ ExecutedEffects:
  ∃ d ∈ AuthorizationDecisions:
    d.requestHash = H(q)
    ∧ d.decision = ALLOW
    ∧ d.validAt = t_execution
    ∧ d.capability covers q
```

No model output, tool output, repository content, external data, or subagent
request can grant itself execution authority. Only deterministic runtime policy
can authorize execution.

## Deliverables

### Deliverable 1: Capability Primitives

| Task | Description | Status |
|---|---|---|
| 1 | Security-boundary audit — tool-effect inventory | Pending |
| 2 | CapabilityGrant types and internal persistence | ✅ Done |
| 3 | AuthorizationRequest + requestHash canonicalization | ✅ Done |
| 4 | Capability inspection CLI (`list`, `inspect`, `explain`) | Pending |

### Deliverable 2: Authorization Kernel

| Task | Description | Status |
|---|---|---|
| 5 | Policy Decision Point — evaluation order, deny-overrides | Pending |
| 6 | Central Policy Enforcement Point — `authorizeAndExecute` | Pending |
| 7 | Path and argument hardening — resolved canonical paths | Pending |
| 8 | Authorization events + RunProof integration | Pending |

### Deliverable 3: Provenance, Taint, and Intent Binding

| Task | Description | Status |
|---|---|---|
| 9 | Provenance labels — record origin of action parameters | Pending |
| 10 | Sensitivity labels — lattice with SECRET boundary | Pending |
| 11 | Intent-action binding — contract/user event grounding | Pending |
| 12 | Prompt-injection containment rules | Pending |

### Deliverable 4: Delegation, Approvals, and Revocation

| Task | Description | Status |
|---|---|---|
| 13 | Capability attenuation — child ≤ parent | Pending |
| 14 | Subagent delegation — derived capabilities | Pending |
| 15 | Approval as scoped capability — exact match required | Pending |
| 16 | Expiry, revocation, replay resistance | Pending |
| 17 | Workspace and MCP trust adapters | Pending |

### Deliverable 5: Security Evaluation

| Task | Description | Status |
|---|---|---|
| 18 | Adversarial fixture suite (prompt injection, escalation, path attacks, secrets, confused deputy) | Pending |
| 19 | Formal, property, and performance evaluation | Pending |

## Release Targets

- Unauthorized executions: **0**
- False allows in adversarial suite: **0**
- Capability amplification: **0**
- Expired/revoked grant bypass: **0**
- Approval replay: **0**
- Secret exfiltration fixtures: **0**
- Unguarded effectful tool paths: **0**
- Benign authorization success: **≥95%**
- Policy decision p95: **<10ms locally**
- Phase A/B regressions: **0**
- Source type errors: **0**

## Implementation Progress

### Commit 1: `432adff3`
- `packages/core/src/capability/types.ts` — all additive core types:
  - `CapabilityAction` (13 actions)
  - `RiskClass` (LOW/MODERATE/HIGH/CRITICAL)
  - `ProvenanceLabel` (10 labels)
  - `SensitivityLabel` (4 levels) + lattice functions
  - `ResourceSelector`, `Principal`, `Issuer`
  - `CapabilityGrant` (with constraints, delegation, status)
  - `AuthorizationRequest` + `CanonicalResource`
  - `AuthorizationDecision` + `DecisionReason`
  - `AuthorizationProfile` (RunProof integration)
  - `IntentBinding`
  - `POLICY_VERSION`
- `packages/core/src/capability/request-hash.ts` — canonical encoding:
  - Domain separator: `"arcana-authorization-request-v1"`
  - Length-prefixed strings, presence-byte for optionals
  - Sorted provenance/sensitivity arrays for determinism
  - `undefined` ≠ `""` in canonical encoding
- `packages/core/src/capability/index.ts` — barrel export
- `packages/engine/test/capability/capability-types.test.ts` — 15 tests:
  - Hash stability (same input → same hash)
  - Hash sensitivity (different nonce/action/resource → different hash)
  - Hex format (64-char)
  - Canonical determinism (label order independence)
  - Optional field encoding (undefined ≠ "")
  - Byte-for-byte determinism
  - Sensitivity lattice (ordering, combine, max)
- 212/212 Phase B tests unchanged
- 0 source type errors

## Explicitly Out of Scope

- Universal containers
- Process isolation for every subagent
- seccomp, Landlock, or OS sandboxing
- Cryptographic bearer capabilities / Macaroons
- PKI or organizational identity
- OAuth redesign
- Distributed IAM
- Full byte-level information-flow control
- Semantic LLM-based authorization as final decision-maker
- Model routing / confidence mathematics
- Verifier mesh / autonomous policy generation
- Zero-knowledge proofs
- Marketplace or billing systems
