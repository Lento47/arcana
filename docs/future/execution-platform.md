# Execution Platform

## Purpose

The Arcana execution platform turns an intent contract into a durable, policy-controlled, evidence-backed execution.

It is not a single agent loop. It is a runtime composed of independent authorities, schedulers, capability adapters, verifiers, evidence collectors, and recovery mechanisms.

## Canonical lifecycle

```text
request
  → admission
  → planning
  → authorization
  → execution
  → verification
  → proof finalization
  → learning
```

Every phase emits immutable events. The current state is a projection over those events.

## Intent contracts

An intent contract defines the work before the system begins acting.

```ts
interface IntentContract {
  id: string
  objective: string
  successCriteria: SuccessCriterion[]
  constraints: Constraint[]
  forbidden: string[]
  assumptions: Assumption[]
  allowedCapabilities: string[]
  budgets: BudgetSet
  expectedArtifacts: ArtifactExpectation[]
  completionPolicy: "all" | "threshold" | "human_acceptance"
}
```

Intent contracts may be authored by a human, generated from a prompt and confirmed, or created by another trusted system. Material changes require a new version and reauthorization.

## Planning

Plans are proposals, not authority.

A plan should include:

- dependencies
- expected inputs and outputs
- required capabilities
- risk estimates
- verification strategy
- rollback strategy
- cost and token estimates
- parallelizable versus sequential steps
- unresolved questions and assumptions

The scheduler can revise a plan when evidence changes, but plan revision must preserve history and identify why the revision occurred.

## Action envelopes

Every executable operation becomes an action envelope.

```ts
interface ActionEnvelope {
  id: string
  runId: string
  parentId?: string
  principal: Principal
  action: string
  resource: string
  input: unknown
  inputHash: string
  capabilityIds: string[]
  contractId: string
  risk?: RiskAssessment
  policyDecisionId?: string
  state: ActionState
}
```

The envelope is the unit of authorization, evidence, retry, cancellation, and replay.

## Runtime scheduler

The scheduler coordinates:

- dependency-aware execution
- bounded concurrency
- resource locks
- fairness between runs
- cancellation propagation
- retry policy
- timeout policy
- checkpoint creation
- cost and token budgets
- waiting approvals and external dependencies
- parent/child run relationships

The scheduler must not bypass the PEP for performance. Authorization can be cached only when the cache key includes all policy-relevant state and the decision remains valid.

## Capability runtime

Capabilities expose controlled operations to agents.

A capability declares:

- stable identity and version
- input and output schemas
- resource derivation
- side-effect classification
- risk metadata
- required evidence
- verification hooks
- rollback or compensation behavior
- idempotency properties
- secret requirements
- sandbox requirements

Capabilities may wrap native tools, MCP servers, APIs, cloud operations, databases, communication systems, or domain-specific services.

## Mutation authority

In governed modes, direct file mutation should be replaced by a centralized mutation authority.

```text
propose diff
  → inspect impact
  → policy decision
  → checkpoint
  → apply
  → verify
  → retain rollback reference
```

The same pattern should eventually apply to infrastructure plans, database migrations, configuration changes, and deployment manifests.

## Verification authority

Verification evaluates declared criteria and material claims independently from the worker that performed the action.

Verifier types include:

- deterministic tests
- type checks and builds
- static analysis
- security scanning
- benchmark comparison
- artifact integrity checks
- deployment health checks
- policy assertions
- model-based review
- human review
- cross-model critique
- environment observation

A verifier reports `passed`, `failed`, or `inconclusive`. It attaches evidence and limitations.

## Evidence system

Evidence records should capture:

- action request and normalized input hash
- policy request and decision
- approval records
- execution start and end
- output commitments or encrypted payloads
- exit status and errors
- filesystem diffs
- network receipts
- artifacts and content hashes
- verifier inputs and outputs
- model/provider identity and routing decision
- token and monetary cost
- timing and environment metadata

Large evidence can live in content-addressed external storage while the RunProof retains hashes, locations, media types, encryption metadata, and retention policy.

## Checkpoints and rollback

Checkpoint strategies vary by resource:

- Git tree or patch for source code
- filesystem snapshot
- database transaction or backup reference
- infrastructure plan and previous state
- configuration version
- deployment revision
- compensating API operation

Arcana must distinguish true rollback from best-effort compensation. Proofs should never imply reversibility where none exists.

## Durable execution

Runs must survive:

- process termination
- terminal disconnection
- machine restart
- model timeout
- provider failure
- approval delay
- dependency unavailability

Durability requires:

- append-only event persistence
- idempotency keys
- leases and heartbeat semantics
- resumable state projections
- recovery policies
- orphaned-action detection
- explicit handling of uncertain external outcomes

## Replay

Replay has multiple modes:

```text
validate       verify proof integrity only
inspect        reconstruct timeline and state
simulate       evaluate decisions without side effects
dry-run        execute safe previews where supported
selective      rerun selected actions or verifiers
full           reproduce the run in a controlled environment
```

Full replay is not always possible because external systems and model behavior change. Arcana should report replay fidelity and substituted dependencies.

## Multi-agent execution

Multi-agent work should be represented as a graph of bounded contracts, not an unstructured conversation among agents.

Roles may include:

- planner
- researcher
- implementer
- tester
- security reviewer
- benchmarker
- release operator
- verifier

Each worker receives a scoped delegation contract. Outputs are artifacts, claims, proposals, or verification records. Shared mutation authority remains centralized unless explicitly delegated.

## Learning system

Arcana should learn from execution history without blindly treating all past behavior as correct.

Reusable knowledge includes:

- successful plan structures
- tool reliability
- recurring failure signatures
- environment-specific constraints
- verification effectiveness
- token and cost estimates
- capability risk patterns
- human override patterns

Learning inputs must retain provenance, quality, freshness, and outcome labels. Failed or inconclusive runs are valuable negative evidence.

## Operational surfaces

The platform should support:

- local single-user runtime
- headless daemon
- CI worker
- remote execution fleet
- enterprise control plane
- embedded SDK runtime
- third-party protocol-compatible runtime

All surfaces consume the same protocol objects and lifecycle semantics.

## Platform success criteria

- long-running runs resume without corrupting state
- side effects remain authorized across retries and recovery
- verification is separable from execution
- proof generation is deterministic from the event stream
- capabilities are portable across interfaces
- provider failure can trigger policy-compliant rerouting
- execution cost and quality are measurable
- multi-agent delegation does not create authority escalation
- workflows can be reused without becoming opaque prompt bundles
