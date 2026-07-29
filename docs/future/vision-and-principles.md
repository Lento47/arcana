# Vision and Principles

## Mission

Arcana exists to make autonomous execution dependable enough for consequential work.

Its mission is broader than coding assistance:

> Convert human intent into bounded, inspectable, verifiable execution across models, tools, systems, and organizations.

The terminal is an interface. Governance is a control mechanism. The lasting product is the execution system itself.

## Strategic position

Arcana should not compete primarily on model intelligence. Frontier-model vendors possess structural advantages in training, distribution, and capital. Arcana instead owns the layer above and around models:

- execution semantics
- capability boundaries
- policy enforcement
- evidence and provenance
- verification and challenge
- replay and recovery
- provider sovereignty
- institutional learning
- interoperability

Models become replaceable reasoning components. Tools become declared capabilities. Runs become durable execution artifacts.

## Product progression

### Phase A — Governed agent runtime

Arcana proves that model-driven work can be mediated by deterministic controls and recorded as durable evidence.

### Phase B — Execution platform

Arcana coordinates long-running, multi-agent, multi-tool work with planning, checkpoints, verification, budgets, recovery, and reusable workflows.

### Phase C — Execution protocol

Arcana publishes stable, implementation-independent contracts and a conformance suite so other products can produce, consume, verify, and continue Arcana-compatible executions.

### Phase D — Execution ecosystem

Independent runtimes, capability providers, verifier providers, proof consumers, and workflow publishers participate without requiring Arcana Cloud.

## Design principles

### 1. The model is not the authority

A model can propose actions, plans, claims, and interpretations. It cannot unilaterally grant itself permission, redefine success, erase evidence, or certify its own work.

### 2. Every side effect crosses an enforcement point

Filesystem mutation, shell execution, network access, secrets access, deployment, communication, billing, and external state changes must pass through a Policy Enforcement Point.

No hidden side-effect path is acceptable.

### 3. Completion is evidence-backed

A run is complete only when its declared success criteria are evaluated. Results may be `passed`, `failed`, or `inconclusive`. Unsupported confidence is not completion.

### 4. Claims are first-class objects

Important assertions must identify their evidence, confidence, scope, assumptions, and potential contradictions. Arcana records not only what happened, but why the system believes its conclusions.

### 5. Evidence is immutable, but privacy-aware

Recorded events are append-only. Sensitive fields may be encrypted, redacted, or represented by commitments, but their removal or transformation must itself be recorded.

### 6. Local-first, cloud-optional

Core execution, policy evaluation, proof generation, and proof validation must work locally. Cloud services may add collaboration, remote execution, storage, fleet policy, and analytics, but cannot become mandatory for protocol validity.

### 7. Provider sovereignty

Users and organizations choose models, compute, storage, and routing policies. Arcana must avoid core semantics tied to one model vendor.

### 8. Least authority, not merely least privilege

Agents receive the minimum capabilities, resources, duration, budget, delegation rights, and mutation authority required for a task.

### 9. Reversibility before autonomy

Where possible, Arcana creates checkpoints, proposed diffs, dry runs, transaction boundaries, or compensating actions before permitting consequential execution.

### 10. Durable execution over chat history

Chats are presentation artifacts. The canonical record is the event-sourced execution: intent, decisions, actions, evidence, artifacts, verification, and outcome.

### 11. Incremental adoption

Organizations must be able to adopt Arcana in stages:

```text
observe → record → warn → approve → enforce → automate
```

A platform that requires immediate full control-plane replacement will not be adopted.

### 12. Small protocol, rich implementations

Only semantics needed for interoperability belong in the protocol. Product-specific UI, storage, orchestration strategies, and proprietary optimizations remain outside the standard.

## Trust model

Arcana does not promise that an execution is correct merely because it is signed or governed.

It distinguishes:

- **Authenticity** — who produced the record?
- **Integrity** — was the record altered?
- **Authorization** — was the action permitted?
- **Execution evidence** — what observable events occurred?
- **Verification** — were success criteria evaluated?
- **Epistemic quality** — are conclusions supported by adequate evidence?
- **Operational correctness** — did the system achieve the desired real-world outcome?

A valid RunProof can document a failed or inconclusive execution. That honesty is a feature.

## Economic value

Arcana's value compounds across several dimensions:

- reduced supervision cost
- reduced repeated investigation
- safer delegation
- faster recovery from interrupted work
- less provider lock-in
- reusable verified workflows
- stronger compliance evidence
- preserved institutional knowledge
- comparable execution quality across teams and agents

The moat is not any single governance feature. It is the accumulated execution substrate: contracts, proofs, integrations, verifier ecosystems, reusable workflows, and organizational history.

## What Arcana should become

Arcana should eventually function as:

- a local execution kernel
- an enterprise agent control plane
- a portable execution SDK
- a proof and replay format
- a capability and verifier ecosystem
- an execution interoperability protocol

It should not become a generic AI brand attached to unrelated features. Every major component must strengthen governed, verifiable, portable execution.
