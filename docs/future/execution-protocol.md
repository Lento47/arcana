# Arcana Execution Protocol

## Protocol purpose

The Arcana Execution Protocol defines a portable language for requesting, authorizing, performing, verifying, and proving autonomous work.

It is not a model protocol, a prompt format, or a replacement for MCP. MCP can expose tools; Arcana defines the execution semantics around using them.

The protocol must remain implementation-independent. Arcana's runtime is the reference implementation, not the protocol itself.

## Interoperability goals

A compliant system should be able to:

- receive an execution request
- resolve principals and capabilities
- produce canonical action envelopes
- represent policy decisions and approvals
- emit ordered execution events
- attach evidence and artifacts
- report verification outcomes
- finalize an integrity-protected RunProof
- validate proofs produced by another runtime
- continue or selectively replay compatible executions

## Protocol layers

### Data model

Canonical objects and validation rules.

### Lifecycle

Allowed states and transitions for runs, actions, approvals, artifacts, and verification.

### Integrity

Canonical serialization, hashing, signatures, event ordering, and content-addressed references.

### Transport profiles

Optional bindings for JSON files, HTTP APIs, event streams, message queues, and local IPC.

### Conformance

Fixtures, invariants, negative tests, compatibility levels, and implementation reports.

## Core objects

### ExecutionRequest

```ts
interface ExecutionRequest {
  protocolVersion: string
  id: string
  createdAt: string
  principal: Principal
  intent: IntentContract
  requestedCapabilities: CapabilityRequest[]
  executionProfile?: string
  contextRefs?: ContentReference[]
  integrity?: IntegrityEnvelope
}
```

### CapabilityManifest

```ts
interface CapabilityManifest {
  protocolVersion: string
  id: string
  version: string
  actions: string[]
  inputSchema: unknown
  outputSchema: unknown
  resourceScheme: string
  sideEffects: string[]
  evidenceRequirements: string[]
  verificationHooks: string[]
  rollback: "native" | "compensating" | "none"
}
```

### ExecutionEvent

```ts
interface ExecutionEvent {
  protocolVersion: string
  runId: string
  sequence: number
  id: string
  type: string
  timestamp: string
  actor: PrincipalRef
  subject: string
  payload: unknown
  previousEventHash?: string
  eventHash: string
  signature?: Signature
}
```

### RunProof

```ts
interface RunProof {
  protocolVersion: string
  runId: string
  request: ContentReference
  eventLog: ContentReference
  principals: Principal[]
  capabilities: CapabilityManifestRef[]
  policies: PolicyReference[]
  artifacts: ArtifactManifest[]
  claims: ClaimRecord[]
  verifications: VerificationRecord[]
  outcome: RunOutcome
  limitations: Limitation[]
  integrity: IntegrityEnvelope
}
```

RunProof is a proof container, not proof that the outcome is objectively correct. Consumers must inspect the evidence and verifier trust model.

## Canonical serialization

Version 1 should use a narrowly specified canonical JSON profile:

- UTF-8
- deterministic property ordering
- normalized number representation
- explicit timestamp format
- prohibited ambiguous values
- normalized URI and path schemes
- schema-version identifiers
- domain-separated hashes

A future binary encoding may be added, but JSON should remain the initial interchange format because inspectability matters during early adoption.

## Resource identifiers

Resources require stable schemes rather than unstructured strings.

Examples:

```text
workspace://repo/src/auth.ts
host://api.example.com/v1/orders
container://build-42
secret://vault/team/payment-token
deployment://production/payments
artifact://sha256/<digest>
model://provider/model/version
```

Normalization and matching rules must be part of the specification and conformance tests.

## Integrity model

The protocol should support:

- hash chaining for event order
- content-addressed artifacts
- request and decision hashes
- signatures for principals and runtime attestations
- optional Merkle roots for large event sets
- redaction commitments
- external timestamping or transparency logs

Different trust deployments may use local keys, organizational PKI, cloud KMS, hardware-backed keys, or decentralized identity. The base protocol should avoid mandating one trust infrastructure.

## Privacy and redaction

Proof portability can conflict with confidentiality. The protocol must represent:

- encrypted evidence
- selectively disclosed fields
- redacted payloads
- commitments to hidden content
- retention and deletion policy
- access-control references
- proof that a redaction occurred after recording

Redaction cannot silently rewrite event history. A derived disclosure proof may omit protected material while retaining commitments to the original record.

## Compatibility

Protocol evolution requires explicit compatibility rules.

Recommended model:

```text
major version   semantic breaking changes
minor version   backward-compatible object or field additions
profile version transport- or domain-specific changes
```

Unknown optional fields should be preserved where possible. Unknown required semantics must fail validation rather than be ignored.

## Conformance levels

### Core

Canonical objects, validation, lifecycle, hashing, and event ordering.

### Policy

Authorization requests, deterministic decisions, reason codes, obligations, and approvals.

### Evidence

Evidence records, artifact manifests, content addressing, and redaction semantics.

### Verification

Success criteria, verifier records, limitations, and completion rules.

### Replay

State reconstruction, idempotency, dependency substitution, and replay reporting.

### Full Runtime

All required levels plus durable execution and enforcement-boundary coverage.

An implementation should claim only the levels it passes.

## Protocol governance

The protocol should begin under Arcana stewardship, then mature toward transparent governance.

Required practices:

- public specifications
- versioned proposals
- reference schemas
- rationale and threat models
- conformance fixtures
- compatibility reports
- security disclosure process
- multiple independent implementer input before standardizing major changes

Avoid forming a standards body before real adoption. Credibility comes from working implementations and interoperability, not ceremony.

## Relationship to adjacent standards

Arcana should integrate rather than replace:

- MCP for tool and context exposure
- A2A-style systems for agent communication
- OpenTelemetry for operational traces
- OAuth/OIDC and workload identity for authentication
- in-toto/SLSA concepts for software supply-chain attestations
- OCI for portable artifacts
- JSON Schema or compatible schema systems for validation

Arcana's unique contribution is the unified execution lifecycle joining intent, authority, side effects, evidence, verification, and proof.

## Adoption sequence

1. Stabilize internal event and RunProof schemas.
2. Ship a standalone validator.
3. Publish protocol packages and schemas.
4. Build adapters for existing agent and tool ecosystems.
5. Release a conformance suite with negative tests.
6. Support external proof producers and consumers.
7. Demonstrate cross-runtime continuation or replay.
8. Formalize protocol governance only after independent adoption.

## Protocol success criteria

Arcana becomes a protocol only when:

- at least two independent implementations exist
- proofs can be produced and validated without Arcana Cloud
- compatibility survives implementation and language differences
- third parties build useful proof consumers or capability providers
- protocol changes follow public compatibility rules
- the protocol solves interoperability problems beyond Arcana's own products
