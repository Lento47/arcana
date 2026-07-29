# Phase B — Capability and Authorization Foundation

## Status

Implementation-completion record based on the Phase B engineering work. Exact code references and commit links must be added after the local governance branch is pushed to GitHub.

## Objective

Phase B defines the canonical language used to express delegated authority.

Its purpose is not yet to enforce every action. It ensures that principals, capabilities, actions, resources, scopes, and requests have deterministic representations that the Phase C Policy Decision Point and Policy Enforcement Points can rely on.

## Core model

```text
Principal
    receives
Capability
    authorizing
Action
    against
Resource
    under
Context and constraints
```

A runtime authorization request must be complete, canonical, serializable, and hashable before it reaches policy evaluation.

## Principal identity

A principal identifies the actor requesting authority, not merely the process executing code.

Representative principal kinds include:

- user;
- first-party agent;
- delegated subagent;
- verifier;
- plugin;
- MCP server or MCP-exposed tool;
- scheduled job;
- service integration;
- system component.

Principal identity must not be inferred from mutable display names or model output.

## Capability model

A capability describes bounded authority. It should contain enough information to evaluate:

- which principal may act;
- which action is allowed;
- which resource patterns are in scope;
- which workspace, session, contract, or delegation scope applies;
- which tool or executable is permitted;
- when the authority expires;
- what constraints or budgets apply.

Conceptually:

```ts
type Capability = {
  id: string
  version: number
  principal: PrincipalSelector
  actions: ActionSelector[]
  resources: ResourceSelector[]
  workspace?: string
  session?: string
  contract?: string
  tools?: string[]
  constraints?: CapabilityConstraint[]
  issuedAt: string
  expiresAt?: string
  issuer: string
  integrity?: CapabilityIntegrity
}
```

## Canonical authorization request

Each effect boundary constructs the same logical request shape before evaluation:

```ts
type AuthorizationRequest = {
  version: number
  requestId: string
  principal: Principal
  action: string
  resource: CanonicalResource
  workspace?: string
  session?: string
  contract?: string
  tool?: string
  inputDigest?: string
  capabilityIds: string[]
  context: AuthorizationContext
  requestHash: string
}
```

The request hash binds the decision to the exact canonical request. A decision for one request must not be replayable for a materially different action, resource, principal, tool input, workspace, session, or delegation contract.

## Resource canonicalization

Resources require deterministic parsing and matching. Examples include:

```text
workspace://repo/src/index.ts
process://executable/git
network://host/api.github.com
mcp://server/tool
session://session-id
artifact://sha256/content-hash
```

Canonicalization must address:

- path normalization;
- traversal attempts;
- platform path differences;
- symbolic or alternate resource spellings;
- host and wildcard semantics;
- executable basenames versus absolute paths;
- resource-kind mismatches;
- workspace boundary preservation.

## Matching invariants

### Reflexivity

A canonical resource matches itself.

### Kind preservation

A selector for one resource kind cannot accidentally authorize another kind.

### Boundary preservation

A path selector must not escape the workspace or scope it represents.

### Traversal resistance

Equivalent traversal spellings cannot produce broader authority.

### Explicit wildcard semantics

Wildcards must be defined by the protocol rather than inherited implicitly from a host language or glob library.

### Deterministic executable identity

Executable matching must define when basename matching is acceptable and when an absolute or resolved executable identity is required.

## Canonical encoding and hashing

Canonical request hashing should guarantee:

- stable key ordering;
- normalized absent and optional values;
- deterministic string encoding;
- no dependence on runtime object insertion order;
- explicit protocol version binding;
- domain separation from capability, evidence, and RunProof hashes;
- rejection of unsupported or ambiguous values.

Example conceptual construction:

```text
requestHash = SHA-256(
  "arcana.authorization-request.v1" || canonicalEncode(requestWithoutHash)
)
```

## Validation boundaries

Phase B validation should reject:

- missing principal identity;
- empty or unknown actions;
- malformed resources;
- mismatched supplied request hashes;
- duplicate or contradictory capability identifiers;
- unsupported protocol versions;
- ambiguous workspace or session scope;
- invalid delegation contracts;
- non-canonical representations where canonical input is required.

## Separation of responsibilities

Phase B should keep the following distinctions clear:

- **schema validation** determines whether a request is well-formed;
- **canonicalization** determines its unique representation;
- **matching** determines whether capability selectors cover the request;
- **policy evaluation** decides allow, deny, or approval;
- **enforcement** prevents the effect when the decision does not permit execution.

Combining these layers makes audits and conformance testing more difficult.

## Exit criteria

Phase B is complete only when:

- principal and capability schemas are stable enough for Phase C;
- all P0 actions and resources can be represented canonically;
- requests have deterministic hashes;
- resource matching has structural and property tests;
- malformed or ambiguous requests fail closed;
- the existing runtime remains behaviorally unchanged until Phase C enforcement is enabled;
- the Phase A/B regression suite remains green.

## Reported verification dimensions

The implementation reports associated with later Phase C work indicate preservation of a 212-test Phase A/B regression baseline. The eventual code PR should provide exact test commands, package locations, commit references, and CI output so this figure can be independently verified.

## Relationship to Phase C

Phase B creates the language. Phase C turns it into authority.

```text
Capability + canonical request
        ↓
Policy Decision Point
        ↓
Decision reason code
        ↓
Policy Enforcement Point
        ↓
Effect executes or is blocked
```

## Verification checklist for the eventual code PR

The code PR should include or reference:

- schema and type definitions;
- canonical encoding implementation;
- request hash implementation;
- resource parser and matcher;
- principal, workspace, session, contract, and tool-scope tests;
- property tests for resource matching and traversal behavior;
- regression and typecheck output;
- a migration note showing how Phase C consumes the Phase B API.

## Known limitation of this record

The connected GitHub repository does not currently contain the local commit series referenced by the Phase B and Phase C completion reports. This document therefore records the intended and reported foundation without claiming that the GitHub branch has independently verified the local implementation.