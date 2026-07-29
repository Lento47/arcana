# Arcana Future Architecture

> Status: strategic design
> Branch: `docs/arcana-future-protocol`
> Horizon: 2026–2031+

Arcana's long-term purpose is not to become another coding assistant. It is to become the execution substrate for trustworthy autonomous work.

The product evolves through three reinforcing layers:

1. **Governance layer** — determines who or what may act, under which constraints, with what evidence and approvals.
2. **Execution platform** — plans, authorizes, executes, verifies, records, resumes, and improves complex work across models and tools.
3. **Execution protocol** — provides portable, implementation-independent contracts for intents, capabilities, policy decisions, evidence, verification, and execution proofs.

The protocol is not a branding exercise and must not be declared complete before independent implementations exist. Arcana first proves the abstractions in its own runtime, then stabilizes them through an SDK, conformance suite, and public specification.

## Core thesis

AI systems should not be trusted because a model sounds confident. They should be trusted only to the degree that their execution is constrained, observable, attributable, verifiable, and recoverable.

Arcana therefore separates five authorities:

- **Intent authority** defines the requested outcome and constraints.
- **Policy authority** decides whether an action may proceed.
- **Execution authority** performs the authorized action.
- **Verification authority** evaluates whether claims and success criteria are supported.
- **Evidence authority** preserves the record needed to audit, replay, or challenge the run.

No single model should own all five.

## Architecture map

```text
Interfaces
  TUI · CLI · IDE · CI · API · Web · external agents
                         │
                         ▼
Arcana SDK
  run API · capability API · policy API · evidence API · verifier API
                         │
                         ▼
Arcana Execution Platform
  intent → plan → authorize → execute → verify → prove → learn
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
Governance kernel   Epistemic kernel   Runtime kernel
PDP/PEP, identity   claims, evidence   scheduler, tools,
capabilities, risk  uncertainty,       sandboxes, replay,
approvals, budgets  contradiction      checkpoints
          └──────────────┼──────────────┘
                         ▼
Arcana Protocol
  canonical schemas · lifecycle · signatures · compatibility · conformance
```

## Document set

| Document | Purpose |
|---|---|
| [vision-and-principles.md](./vision-and-principles.md) | North star, product boundaries, principles, and strategic positioning |
| [governance-layer.md](./governance-layer.md) | Identity, capabilities, PDP/PEP, risk, approvals, budgets, and enforcement |
| [execution-platform.md](./execution-platform.md) | Runtime lifecycle, scheduling, verification, evidence, replay, and learning |
| [execution-protocol.md](./execution-protocol.md) | Portable objects, wire semantics, compatibility, signatures, and adoption path |
| [epistemic-agent.md](./epistemic-agent.md) | Claim-oriented reasoning, uncertainty, source quality, contradiction, and calibrated completion |
| [sdk.md](./sdk.md) | Arcana SDK boundaries, packages, APIs, adapters, and developer experience |
| [components.md](./components.md) | Full component inventory and ownership boundaries |
| [roadmap-2026-2031.md](./roadmap-2026-2031.md) | Multi-year sequence, gates, measurable outcomes, and failure conditions |
| [adoption-and-ecosystem.md](./adoption-and-ecosystem.md) | Open-source strategy, conformance, integrations, enterprise adoption, and protocol governance |
| [risks-and-non-goals.md](./risks-and-non-goals.md) | Strategic risks, anti-patterns, and explicit non-goals |

## Product hierarchy

```text
Arcana Protocol
    ↓ defines interoperable contracts
Arcana SDK
    ↓ makes the contracts usable
Arcana Runtime
    ↓ executes the contracts locally or remotely
Arcana Products
    ↓ TUI, CLI, cloud, enterprise, integrations
Arcana Ecosystem
    ↓ third-party runtimes, capabilities, verifiers, proof consumers
```

The dependency direction must remain downward. Protocol packages must not depend on product packages. The TUI is a client of the runtime; it is never the source of execution truth.

## Canonical lifecycle

```text
requested
  → admitted
  → planned
  → authorized
  → executing
  → waiting_approval | waiting_dependency
  → verifying
  → completed
```

Terminal alternatives:

```text
denied · failed · cancelled · rolled_back · inconclusive · invalid
```

Completion means the success criteria were evaluated. It does not mean the model stopped producing tokens.

## The Arcana object model

The long-term protocol revolves around a small set of canonical objects:

- `ExecutionRequest`
- `IntentContract`
- `Principal`
- `CapabilityManifest`
- `ActionEnvelope`
- `PolicyDecision`
- `ApprovalRecord`
- `EvidenceRecord`
- `ClaimRecord`
- `VerificationRecord`
- `ArtifactManifest`
- `CheckpointRecord`
- `ExecutionEvent`
- `RunProof`

These objects should be versioned, canonicalizable, hashable, and independently validatable.

## Strategic test

Arcana has succeeded when all of the following are true:

1. An external developer can embed governed execution without installing the Arcana TUI.
2. A third party can validate an Arcana proof without contacting Arcana Cloud.
3. Multiple model providers and tool systems can participate in one run without changing the proof semantics.
4. A run can be interrupted, resumed, challenged, and selectively replayed.
5. Independent runtimes can pass the Arcana conformance suite.
6. Organizations can adopt Arcana incrementally: observe first, enforce later.
7. The protocol remains useful even when Arcana's own product is not involved.

## Relationship to existing design documents

This directory consolidates and extends the existing north-star work in:

- `docs/core-engine-vision.md`
- `docs/agent-contracts.md`
- `docs/run-capsules.md`
- `docs/verification-records.md`
- `docs/route-decisions.md`
- `docs/context-supply-chain.md`
- `docs/memory-receipts.md`
- `docs/trust-boundaries.md`
- `docs/tool-risk-model.md`
- `docs/architecture/token-kernel-missions.md`

Those documents remain valuable detailed references. The future architecture defines how they fit together as one system and identifies the path from internal runtime concepts to an interoperable execution standard.
