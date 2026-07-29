# Governance Layer

## Purpose

The governance layer converts user, organizational, and environmental constraints into deterministic decisions at every consequential execution boundary.

Governance is not a dashboard, a log, or an approval popup. It is an active runtime system that mediates authority.

## Core responsibilities

- identify principals and delegated actors
- resolve capabilities and resource scopes
- evaluate policies deterministically
- compute contextual risk
- require or validate approvals
- enforce budgets and temporal constraints
- constrain delegation
- preserve decision evidence
- deny execution when required context is absent or invalid

## Authority model

### Principals

A principal is an entity that requests, authorizes, executes, verifies, or observes work.

```ts
interface Principal {
  id: string
  kind: "human" | "agent" | "service" | "organization" | "verifier"
  issuer: string
  attributes: Record<string, string | number | boolean>
  sessionId?: string
  workspaceId?: string
}
```

Principals are not interchangeable. A model invocation, an agent identity, a runtime service, and a human approver may all be involved in one action.

### Capability grants

A capability grant authorizes a principal to request a class of action against bounded resources.

```ts
interface CapabilityGrant {
  id: string
  principal: string
  actions: string[]
  resources: string[]
  constraints: {
    workspace?: string
    session?: string
    contract?: string
    tool?: string
    maxUses?: number
    expiresAt?: string
    maxCost?: number
    maxDurationMs?: number
  }
  delegation?: {
    allowed: boolean
    maxDepth: number
    subsetOnly: true
  }
}
```

Capabilities should be explicit, narrow, revocable, and non-escalating by default.

## PDP and PEP

### Policy Decision Point

The PDP evaluates a canonical authorization request and returns one deterministic decision.

```ts
interface AuthorizationRequest {
  requestId: string
  requestHash: string
  principal: Principal
  action: string
  resource: string
  capabilityIds: string[]
  context: Record<string, unknown>
}

type PolicyDecision =
  | { effect: "allow"; reasonCode: string; obligations: Obligation[] }
  | { effect: "deny"; reasonCode: string; details?: string }
  | { effect: "require_approval"; reasonCode: string; approval: ApprovalRequirement }
  | { effect: "constrain"; reasonCode: string; obligations: Obligation[] }
```

The existing Phase C deterministic PDP and reason-code model should become the foundation for this layer.

### Policy Enforcement Point

The PEP sits directly before the side effect. It must:

1. canonicalize the request
2. bind it to the current principal, workspace, session, and contract
3. verify request integrity
4. obtain a PDP decision
5. satisfy obligations or approvals
6. execute only the authorized action
7. emit evidence of both decision and effect

Authorization performed earlier in a plan is not sufficient. The action must be revalidated at execution time because state, policy, scope, or credentials may have changed.

## Policy layers

Policies should combine predictably across layers:

```text
protocol invariants
  ↓
organization policy
  ↓
workspace policy
  ↓
project policy
  ↓
session policy
  ↓
intent contract
  ↓
capability constraints
```

Recommended precedence:

1. invalid request → deny
2. explicit deny → deny
3. missing capability → deny
4. unmet mandatory obligation → deny
5. approval requirement → wait for approval
6. constraint obligations → permit only under constraints
7. explicit allow → allow
8. no matching rule → deny

No lower layer may relax a higher-layer deny.

## Obligations

A decision may require controls rather than merely allow or deny.

```ts
type Obligation =
  | { type: "sandbox"; profile: string }
  | { type: "checkpoint"; scope: string[] }
  | { type: "diff_only" }
  | { type: "redact"; fields: string[] }
  | { type: "verify"; verifierIds: string[] }
  | { type: "limit_network"; hosts: string[] }
  | { type: "limit_cost"; amount: number; currency: string }
  | { type: "human_review"; role: string }
  | { type: "record_evidence"; evidenceTypes: string[] }
```

The PEP must prove obligations were satisfied before or after execution according to their semantics.

## Risk engine

Risk is contextual and should not be represented by a single static tool label.

Inputs include:

- action class
- target resource sensitivity
- requested command or operation
- mutation size
- network destination
- credential access
- current repository state
- reversibility
- blast radius
- production versus development environment
- novelty relative to known workflows
- confidence and evidence quality
- dependency on untrusted content
- prior failures in the current run

Outputs include:

```ts
interface RiskAssessment {
  level: "low" | "medium" | "high" | "critical"
  dimensions: Array<{
    name: string
    score: number
    reasons: string[]
  }>
  requiredControls: Obligation[]
  modelVersion: string
}
```

Risk scoring can use heuristics or learned models, but policy effects must remain deterministic for a fixed normalized input and policy version.

## Approvals

Approvals must be scoped and bound to an immutable request hash.

```ts
interface ApprovalRecord {
  id: string
  requestHash: string
  approver: Principal
  scope: "action" | "step" | "session" | "contract" | "resource_class"
  decision: "approved" | "rejected"
  conditions: Obligation[]
  issuedAt: string
  expiresAt?: string
  signature?: string
}
```

An approval must not silently authorize a materially different command, path, destination, model, cost, or mutation.

## Delegation

Subagents receive derived capabilities, never the parent's ambient authority.

Delegation rules:

- grants must be strict subsets of the parent's effective authority
- delegation depth is bounded
- budgets are divided, not duplicated
- delegated work is tied to an intent contract
- mutation authority is separately granted
- child actions preserve parent and delegation lineage
- revocation propagates downward

## Budgets and quotas

Governance should enforce:

- token budgets
- model cost budgets
- tool-call budgets
- wall-clock duration
- concurrency
- filesystem mutation volume
- network bytes or request counts
- approval frequency
- retry limits
- delegation depth and count

Budgets are security controls, operational controls, and economic controls simultaneously.

## Policy language strategy

Arcana should initially expose an ergonomic TypeScript builder while compiling to a canonical intermediate representation.

```ts
export default definePolicy({
  rules: [
    allow("filesystem.read", "workspace://**"),
    requireApproval("filesystem.write", "workspace://src/**"),
    deny("terminal.execute", command.matches("git push --force")),
  ],
})
```

The protocol should standardize the decision request, decision result, reason codes, and obligations—not necessarily one universal authoring language.

## Governance modes

```text
observe   record decisions without blocking
warn      surface violations but permit continuation
approve   require approval at selected boundaries
enforce   block unauthorized actions
locked    permit only pre-authorized contracts and capabilities
```

Modes must not alter proof semantics. Even observe mode records what the enforcement decision would have been.

## Governance success criteria

- every P0 side-effect boundary is enforced
- no capability escalation through aliases, traversal, wildcard ambiguity, or delegation
- policy decisions are reproducible from canonical inputs
- approvals are request-bound and independently verifiable
- deny decisions fail closed
- governance overhead remains small relative to tool execution latency
- organizations can inspect why a decision occurred through stable reason codes
- policy updates are versioned and represented in RunProof
