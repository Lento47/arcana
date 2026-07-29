# Arcana Governance Implementation

This directory records the implementation path that turns Arcana from an agent loop into a governed execution runtime.

The documents distinguish between:

- **implemented behavior** — code and tests reported as completed in the implementation work;
- **verified repository state** — behavior independently confirmed on the GitHub branch under review;
- **design target** — architecture that has not yet reached production code.

This distinction is important. Arcana must not treat architectural intent as shipped enforcement.

## Phase index

| Phase | Purpose | Document |
|---|---|---|
| Phase A | Discover and classify every effectful runtime boundary | [phase-a-effect-boundary-inventory.md](./phase-a-effect-boundary-inventory.md) |
| Phase B | Establish canonical capabilities, requests, identities, and deterministic matching | [phase-b-capability-foundation.md](./phase-b-capability-foundation.md) |
| Phase C | Enforce policy at runtime boundaries through PDP and PEP components | Future implementation record |

## Architectural progression

```text
Phase A: know every place an effect can happen
        ↓
Phase B: describe authority canonically
        ↓
Phase C: decide and enforce before every effect
        ↓
Phase D+: produce evidence, verification, replay, and portable proofs
```

## Governing rule

No model, agent, tool, plugin, MCP server, subagent, or UI component is an authority by itself.

Authority must be represented as a canonical capability, evaluated deterministically, and enforced at the effect boundary before execution.

## Documentation policy

Every phase completion record should include:

1. scope and invariants;
2. files and components introduced;
3. tests and properties covered;
4. known gaps and deferred work;
5. exact commit or PR references;
6. regression results;
7. a statement separating implementation from aspiration.
