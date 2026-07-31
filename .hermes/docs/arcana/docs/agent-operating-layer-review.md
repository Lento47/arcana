# Agent Operating Layer Readiness Review

This is the second QA pass for the Agent Operating Layer documentation branch.

No implementation is approved by this review. The goal is to decide whether the product model is coherent enough to keep evolving.

## Review result

Status:

```txt
Proceed with documentation evolution.
Do not begin implementation yet.
```

Reason:

```txt
The concept has become clearer: Arcana turns autonomous work into durable objects.

But the object model needs examples, lifecycle diagrams, and schema-level decisions before code should be written.
```

## What improved in this pass

The branch moved from a feature list into an operating model.

Before:

```txt
15 innovative ideas for Arcana
```

After:

```txt
A layered object system for autonomous work:
  Agent Contracts
  Run Capsules
  Memory Receipts
  Context Sources
  Route Decisions
  Skill Artifacts
  Tool Profiles
```

This is a major improvement because it gives Arcana a product grammar.

## Current documentation map

```txt
docs/agent-operating-layer.md
  Original broad thesis and feature landscape.


docs/agent-operating-layer-qa.md
  QA framework, kill criteria, primitive hierarchy, and quality gates.


docs/agent-operating-layer-evolution.md
  Evolved thesis, operating loop, object model, product language, and roadmap.


docs/run-capsules.md
  Run Capsule object model and quality levels.


docs/agent-contracts.md
  Agent Contract object model and satisfaction criteria.


docs/memory-receipts.md
  Sourced memory object model.


docs/context-supply-chain.md
  Observable context provenance and trust model.
```

## Strongest current insight

The strongest insight is this:

```txt
Arcana should not manage conversations.
Arcana should manage autonomous work objects.
```

That changes the whole product direction.

A chat-first agent optimizes for response quality.

Arcana should optimize for:

```txt
bounded work
portable work
inspectable work
replayable work
comparable work
sovereign work
compound work
```

## Current object priority

### P0 objects

These are foundational:

```txt
1. Agent Contract
2. Run Capsule
3. Context Source
4. Memory Receipt
5. Route Decision
```

### P1 objects

These depend on P0:

```txt
6. Skill Artifact
7. Tool Profile
8. Verification Record
9. Dependency Intent Record
```

### P2 objects

These should wait:

```txt
10. Arena Candidate
11. Worktree Candidate
12. Marketplace Asset
13. Personal Agent Identity
```

## Readiness assessment by pillar

| Pillar | Current maturity | Verdict |
|---|---:|---|
| Run Capsules | Medium | Strong enough for deeper design docs. |
| Agent Contracts | Medium | Strong enough for examples and schema review. |
| Memory Receipts | Medium | Good concept, needs privacy/scoping review. |
| Context Supply Chain | Medium | Good concept, needs influence model. |
| Sovereign Model Routing | Low/medium | Needs dedicated Route Decision doc. |
| Skill Compiler | Low | Needs delay until contracts/capsules exist. |
| Tool Intelligence Layer | Low | Needs clearer name and MCP-specific review. |
| Agent Arena | Low | Needs delay until verification/capsules exist. |
| Worktrees | Low | Needs delay until capsule comparison exists. |
| Marketplace | Very low | Must not be built early. |

## Decisions made

### Decision 1: Object-first, not feature-first

Arcana should define durable objects before adding features.

Reason:

```txt
Features without objects become UI clutter.
Objects create compounding product value.
```

### Decision 2: Contracts and Capsules are the foundation

Agent Contracts define the boundary.
Run Capsules record the execution.

Together:

```txt
contract → capsule
```

This is the smallest powerful Arcana loop.

### Decision 3: Memory must have receipts

Memory cannot be hidden personalization.

Every memory used by Arcana should be visible, scoped, sourced, and challengeable.

### Decision 4: Context is a supply chain

Context should not be a prompt blob.

Every important context item should have provenance, trust, staleness, and scope.

### Decision 5: Marketplace is delayed

No marketplace until local primitives are excellent.

Reason:

```txt
A marketplace before strong primitives becomes a prompt dump.
```

## Open decisions

These still need design work.

### Open decision: Route Decision object

Questions:

```txt
What fields explain model choice?
How are privacy/cost/risk policies represented?
How does local-first routing degrade gracefully?
How do route decisions attach to capsules?
```

### Open decision: Verification Record object

Questions:

```txt
How does Arcana distinguish claimed success from proven success?
How are skipped tests represented?
What counts as inconclusive verification?
How does human review attach to a capsule?
```

### Open decision: Skill Artifact object

Questions:

```txt
What is the minimum difference between a skill and a prompt?
What makes a skill testable?
What permissions can a skill request?
How does a skill declare failure modes?
```

### Open decision: Tool Profile object

Questions:

```txt
How does Arcana score tool legibility?
How does Arcana identify dangerous write operations?
How are MCP tools represented?
How are tool descriptions repaired or constrained?
```

## QA threats

### Threat 1: The concept gets too abstract

Mitigation:

```txt
Every doc must include concrete commands, examples, failure modes, and QA checklists.
```

### Threat 2: Governance dominates the story again

Mitigation:

```txt
Keep governance as one outcome of durable work objects, not the entire product identity.
```

### Threat 3: It becomes a clone of existing coding agents

Mitigation:

```txt
Prioritize objects that existing coding agents do not own deeply: contracts, capsules, receipts, context supply chain, route decisions.
```

### Threat 4: It becomes too enterprise-heavy too early

Mitigation:

```txt
Keep the CLI personal, local-first, and useful to one serious developer before expanding to teams.
```

### Threat 5: It promises perfect replay

Mitigation:

```txt
Use replay quality levels: inspectable, partially replayable, replayable.
```

## Next documentation improvements

The next docs should be:

```txt
docs/route-decisions.md
  Sovereign routing object model.


docs/verification-records.md
  Proven vs claimed success.


docs/skill-artifacts.md
  Compiled skills as operational capabilities.


docs/tool-profiles.md
  Tool legibility and safety model.
```

## Implementation block

Do not implement yet until these are documented:

```txt
Route Decision object
Verification Record object
examples for Run Capsule + Agent Contract interaction
minimum JSON examples for all P0 objects
how objects compose into one Run Capsule
```

## Final QA judgment

This branch is now moving in the right direction.

The new level is not more features. The new level is clearer product physics:

```txt
Prompts become contracts.
Sessions become capsules.
Context becomes a supply chain.
Memory becomes receipts.
Model choice becomes route decisions.
Verification separates claims from proof.
```

That is a stronger foundation than governance alone.
