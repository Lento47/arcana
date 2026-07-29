# Component Architecture

## Purpose

This document defines the future Arcana component map and the authority boundary owned by each component.

The objective is to prevent governance, execution, evidence, and verification logic from becoming scattered across tools, prompts, the TUI, or provider adapters.

## Component map

```text
Interfaces
├── TUI
├── CLI
├── Web Console
├── IDE adapters
├── CI adapters
└── External SDK consumers

Application services
├── Run Service
├── Workflow Service
├── Approval Service
├── Artifact Service
├── Policy Administration Service
└── Fleet / Remote Execution Service

Execution kernel
├── Admission Controller
├── Intent Contract Manager
├── Planner
├── Scheduler
├── Action Envelope Factory
├── Capability Registry
├── Policy Enforcement Points
├── Mutation Authority
├── Sandbox Manager
├── Model Router
├── Verifier Coordinator
├── Checkpoint / Recovery Manager
└── Run Finalizer

Governance kernel
├── Principal Resolver
├── Capability Authority
├── Policy Decision Point
├── Policy Compiler
├── Risk Engine
├── Approval Evaluator
├── Budget Authority
├── Delegation Authority
└── Revocation Service

Epistemic kernel
├── Claim Registry
├── Evidence Graph
├── Assumption Registry
├── Contradiction Detector
├── Source Provenance Service
├── Confidence Calibrator
├── Challenge Coordinator
└── Epistemic Outcome Evaluator

Proof and storage
├── Event Store
├── Evidence Store
├── Artifact Store
├── RunProof Projector
├── Canonical Serializer
├── Integrity / Signature Service
├── Redaction Service
└── Replay Engine

Protocol and ecosystem
├── Protocol Schemas
├── Validator
├── Conformance Suite
├── Compatibility Registry
├── Capability SDK
├── Verifier SDK
├── Transport Profiles
└── Integration Adapters
```

## Interface components

### TUI

Responsibilities:

- display projected execution state
- show action, policy, approval, evidence, and verifier receipts
- collect user intent and approvals
- permit inspection, challenge, cancellation, and replay

The TUI must never become the authority for policy, completion, or mutation.

### CLI

Responsibilities:

- create and control runs
- export and validate proofs
- manage policies and capabilities
- run conformance checks
- support automation-friendly structured output

### Web Console

Responsibilities:

- organization and fleet administration
- policy distribution
- approvals and audit views
- execution analytics
- artifact access under organizational controls

Core local execution must not require the console.

## Application services

### Run Service

Owns run creation, lifecycle commands, state projections, parent-child relationships, and external APIs.

### Workflow Service

Owns reusable intent templates, execution graphs, versioning, parameters, dependencies, and release channels.

### Approval Service

Owns approval requests, routing, expiration, signatures, request-hash binding, and organizational approval policies.

### Artifact Service

Owns artifact metadata, content-addressed references, storage adapters, encryption metadata, retention, and access policy.

## Execution-kernel components

### Admission Controller

Validates protocol version, principal, intent contract, requested capabilities, budgets, workspace, and required context before planning or execution.

### Intent Contract Manager

Owns contract versions, material-change detection, success criteria, constraints, forbidden actions, and completion policy.

### Planner

Produces a proposed execution graph. It does not authorize actions or certify completion.

### Scheduler

Owns dependencies, concurrency, retries, timeouts, leases, cancellation, waiting states, and resource locks.

### Action Envelope Factory

Canonicalizes each action and binds it to the run, principal, capability, contract, resource, and input hash.

### Capability Registry

Discovers and validates capability manifests. It prevents ambiguous identity or version substitution.

### Mutation Authority

Owns proposed diffs, impact analysis, checkpoints, application, and rollback references for mutable resources.

### Sandbox Manager

Creates constrained execution environments and enforces filesystem, network, process, resource, and secret boundaries.

### Model Router

Selects models according to task requirements, organizational policy, availability, privacy, cost, latency, and quality history. It records every routing decision.

### Verifier Coordinator

Maps success criteria and claims to verifier strategies, executes them independently, resolves disagreement, and reports limitations.

### Recovery Manager

Detects interrupted or uncertain actions, reconstructs state, resumes idempotently, and escalates ambiguous external side effects.

### Run Finalizer

Evaluates lifecycle completeness, verification state, unresolved limitations, evidence requirements, and integrity before producing the final RunProof.

## Governance-kernel components

### Principal Resolver

Maps authenticated identities and runtime actors into canonical principals.

### Capability Authority

Issues, derives, narrows, revokes, and validates capability grants.

### Policy Decision Point

Returns deterministic allow, deny, approval, or constrained decisions with stable reason codes.

### Policy Compiler

Compiles author-friendly policy sources into a canonical, versioned policy IR.

### Risk Engine

Computes contextual risk and required controls. It does not independently authorize execution.

### Budget Authority

Tracks and reserves tokens, money, steps, duration, concurrency, mutations, retries, and delegation resources.

### Delegation Authority

Derives child grants and proves they are strict subsets of parent authority.

## Epistemic-kernel components

### Claim Registry

Stores versioned claims, status, scope, author, confidence basis, and evidence relationships.

### Evidence Graph

Maps claims to observations, sources, artifacts, tests, and contradicting evidence.

### Assumption Registry

Tracks assumptions and prevents critical unvalidated assumptions from disappearing into model context.

### Contradiction Detector

Identifies incompatible claims or outcomes and starts a challenge or investigation path.

### Confidence Calibrator

Measures whether confidence correlates with verified outcomes across tasks and models.

### Challenge Coordinator

Allows verifiers, humans, and agents to challenge claims with counter-evidence or failed reproduction.

## Proof and storage components

### Event Store

Append-only source of execution truth. State tables and UI projections are derived views.

### RunProof Projector

Builds protocol-compliant RunProof objects from events and referenced content.

### Canonical Serializer

Produces stable bytes for hashing, signing, and cross-language validation.

### Integrity Service

Owns hashes, signatures, key references, event-chain verification, and optional transparency-log integration.

### Redaction Service

Produces privacy-preserving disclosure views without silently rewriting the original execution history.

### Replay Engine

Validates, reconstructs, simulates, dry-runs, or selectively re-executes recorded actions while reporting fidelity.

## Deployment boundaries

Arcana should support three packaging profiles.

### Embedded

A library inside another application. Uses local policy, event, and proof services.

### Local runtime

A daemon or CLI process with durable local state, sandboxes, and optional remote integrations.

### Distributed control plane

Organization services coordinate policy, approvals, remote workers, artifact storage, and analytics while workers retain local PEP enforcement.

Remote policy distribution must not turn the central service into the only enforcement point. Side effects remain locally enforced.

## Dependency rules

- protocol packages depend on no product package
- policy evaluation depends on canonical protocol types, not UI state
- tools depend on the PEP, not directly on approval UI
- RunProof depends on events and content references, not random application call sites
- verifier logic remains separate from worker logic
- storage adapters implement interfaces and cannot redefine proof semantics
- model adapters cannot bypass capability or evidence systems
- TUI and web surfaces consume state projections only

## Initial implementation mapping

Existing Arcana areas can evolve toward these boundaries:

- current permission and Phase C PDP/PEP work → Governance Kernel
- tool wrappers → Action Envelope Factory and Capability Runtime
- session events → Event Store and state projections
- RunProof work → RunProof Projector
- route decisions → Model Router evidence
- verification records → Verifier Coordinator
- memory receipts and context supply chain → Epistemic Kernel and Evidence Graph
- command spine → TUI projection of execution events

The transition should wrap and promote existing functionality rather than rewrite everything at once.
