# Phase A — Effect Boundary Inventory

## Status

Implementation-completion record based on the Phase A engineering work. The exact implementation commits must be linked after the local governance branch is pushed to GitHub.

## Objective

Phase A answers the first question required for governed autonomy:

> Where can Arcana cause an externally observable effect?

Policy cannot be complete when enforcement covers only selected tools. Before implementing deterministic authorization, Arcana must identify every runtime path capable of changing files, invoking processes, accessing networks, mutating sessions, calling plugins, delegating work, or reaching external systems.

## Scope

The inventory covers effect-producing paths such as:

- terminal and process execution;
- file creation, replacement, patching, deletion, rename, and permission changes;
- network access and web fetches;
- MCP and plugin execution;
- delegated subagent execution;
- session and workspace mutations;
- external service and connector calls;
- environment and credential-sensitive operations;
- scheduled and background execution;
- any bypass path that invokes a tool implementation directly.

## Required output

Every discovered boundary receives a stable identifier and classification.

A boundary record should include:

```ts
type EffectBoundary = {
  id: string
  subsystem: string
  entrypoint: string
  effectKind: string
  action: string
  resourceDerivation: string
  principalSource: string
  currentEnforcement: "none" | "interactive_permission" | "deterministic_policy"
  bypassRisk: string[]
  testCoverage: string[]
}
```

## Core invariants

### Complete mediation

Every effect must pass through an enforceable boundary. Authorization applied only in the TUI or command parser is insufficient because alternative call paths may bypass it.

### Boundary authority

The component immediately before the effect is the Policy Enforcement Point. Higher-level callers may request an action but cannot declare it authorized.

### Stable classification

Equivalent effects must map to the same canonical action and resource semantics regardless of whether they originate from the TUI, CLI, SDK, plugin, MCP adapter, cron runtime, or subagent.

### Deny unknown paths

An effect path that cannot construct a canonical authorization request must not silently execute in governed mode.

## Deliverables

Phase A should leave the repository with:

1. a machine-readable effect-boundary inventory;
2. a human-readable audit mapping boundaries to runtime entrypoints;
3. tests proving important boundaries are present;
4. an explicit list of deferred or non-enforceable paths;
5. a baseline against which Phase C complete mediation can be measured.

## Exit criteria

Phase A is complete only when:

- all P0 effect boundaries are enumerated;
- each boundary has a canonical effect category;
- direct execution paths and wrappers are both identified;
- the team can state where the PEP must be inserted for every P0 boundary;
- missing coverage is represented as tracked debt rather than assumed safe;
- the existing Phase A/B regression suite remains green.

## Relationship to later phases

Phase A does not decide whether an action is allowed. It makes deterministic authorization possible by ensuring Arcana knows where decisions must be enforced.

```text
Effect inventory
    ↓
Canonical request construction
    ↓
Policy decision
    ↓
Boundary enforcement
    ↓
Evidence and proof
```

## Verification checklist for the eventual code PR

When the local implementation branch is pushed, the code PR should include or reference:

- the full inventory file;
- the count of P0/P1/P2 boundaries;
- each runtime function used as a PEP insertion point;
- tests that fail when a required boundary disappears;
- regression counts and typecheck results;
- a comparison showing no effect boundary is enforced only at the presentation layer.

## Known limitation of this record

The connected GitHub repository does not currently contain the local Phase A/B/C commit series referenced by the implementation completion reports. Therefore this document records the architecture and acceptance criteria but does not claim independent verification of those local commits.