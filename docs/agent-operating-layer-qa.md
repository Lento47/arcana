# Agent Operating Layer QA Framework

This document reviews and hardens the Agent Operating Layer thesis without implementing runtime changes.

The goal is to keep Arcana from becoming a collection of cool agent ideas. Every concept must survive product, architecture, trust, and differentiation review.

## QA verdict

The thesis is strong, but the first draft is too broad.

Current strength:

```txt
Arcana is not only governance.
Arcana is a runtime for programmable autonomous work.
```

Current risk:

```txt
Too many pillars can make Arcana feel unfocused.
```

Required evolution:

```txt
Turn the idea list into a layered operating model.
```

## Core quality bar

A feature belongs in Arcana only if it passes at least three of these tests:

1. **Execution test** — does it make agent work more executable, replayable, comparable, or resumable?
2. **Trust test** — does it make agent behavior easier to inspect, explain, constrain, or verify?
3. **Sovereignty test** — does it increase user control over models, tools, data, context, memory, or execution location?
4. **Portability test** — can the output move across machines, teams, repos, or time?
5. **Compound value test** — does it become more valuable after multiple runs, agents, or workflows?
6. **Terminal-native test** — does it make sense from the CLI/TUI instead of requiring a dashboard-first product?
7. **Differentiation test** — is this meaningfully different from a chat UI, coding agent, CI job, prompt library, or dashboard?

If an idea does not pass at least three, it is probably not an Arcana primitive.

## Primitive hierarchy

The original 15 pillars should be reorganized into four layers.

```txt
Layer 0: Execution substrate
  Run Capsules
  Agent Contracts
  Agent Blackbox Recorder

Layer 1: Intelligence routing
  Sovereign Model Routing
  Local Machine-Aware Agent
  Agent Arena

Layer 2: Knowledge and context
  Context Supply Chain
  Memory with Receipts
  Code Archaeology

Layer 3: Capability ecosystem
  Skill Compiler
  Tool Intelligence Layer
  Dependency Intent System
  Operational Intelligence Marketplace

Cross-cutting workflow layer
  Agent Worktrees
  Personal Agent Runtime
```

This hierarchy is important because Run Capsules and Agent Contracts should become the foundation. The other ideas should plug into them.

## Strongest product primitives

### 1. Run Capsules

Status: keep, highest priority.

Why it matters:

```txt
It turns agent work from an ephemeral chat/session into a durable object.
```

QA requirements:

- must be readable by humans
- must be replayable or at least partially replayable
- must bind together commands, diffs, context, model route, tools, artifacts, and verification
- must support comparison between attempts
- must export cleanly
- must not depend on a cloud dashboard

Failure mode:

```txt
If a capsule is only an audit log, it is not enough.
```

A capsule must be an operational object, not just a record.

### 2. Agent Contracts

Status: keep, highest priority.

Why it matters:

```txt
It turns prompts into constrained autonomous work orders.
```

QA requirements:

- must define allowed scope
- must define forbidden actions
- must define success criteria
- must define budget/risk bounds
- must be attachable to a capsule
- must be validated before execution

Failure mode:

```txt
If contracts become verbose YAML with no enforcement path, they become theater.
```

Contracts must be executable constraints, not policy prose.

### 3. Memory with Receipts

Status: keep, high priority.

Why it matters:

```txt
It prevents hidden, vague, unchallengeable memory.
```

QA requirements:

- every memory has source
- every memory has confidence
- every memory has scope
- every memory can be challenged or forgotten
- every memory can show which runs used it

Failure mode:

```txt
If memory cannot explain itself, it should not influence agent work.
```

### 4. Context Supply Chain

Status: keep, high priority.

Why it matters:

```txt
Agents fail or hallucinate because context provenance is invisible.
```

QA requirements:

- every context item has source
- every context item has trust level
- every context item has staleness metadata
- every run can show context inputs
- context can be diffed across runs

Failure mode:

```txt
If context is only a prompt blob, Arcana loses its edge.
```

### 5. Sovereign Model Routing

Status: keep, high priority.

Why it matters:

```txt
The user should choose which intelligence touches their code and data.
```

QA requirements:

- route decisions must be explainable
- policies must support local-first and provider restrictions
- route decisions must be recorded in capsules
- model choice must be tied to task type, cost, risk, and data sensitivity

Failure mode:

```txt
If routing is just a provider dropdown, it is not sovereignty.
```

## Ideas that need discipline

### Agent Arena

Keep, but avoid making it a gimmick.

The arena is valuable only if outputs are judged by evidence:

```txt
tests
patch size
risk score
cost
runtime
human review
regression checks
contract satisfaction
```

Do not build an arena just to run multiple models. Build it to make agent selection empirical.

### Skill Compiler

Keep, but avoid building a prompt marketplace.

A skill is not a prompt. A skill must include:

```txt
inputs
outputs
tool requirements
risk profile
verification path
test fixtures
artifact schema
failure cases
```

### Operational Intelligence Marketplace

Keep as long-term, not near-term.

This should not be a store for prompts. It should distribute verified operational assets:

```txt
contracts
capsules
skills
routing policies
tool profiles
review policies
```

Marketplace comes after there is a strong local runtime.

### Personal Agent Runtime

Keep, but scope carefully.

This can become too abstract. It should start as profiles:

```txt
security-researcher
release-manager
frontend-builder
docs-writer
founder-operator
```

Each profile should control model route, skills, memory scope, risk tolerance, and contract defaults.

## Ideas that should be delayed

Delay these until Run Capsules, Contracts, Memory Receipts, and Context Supply Chain are solid:

```txt
Operational Intelligence Marketplace
full Agent Arena UI
advanced multi-agent orchestration
public capsule sharing
third-party skill publishing
```

Reason:

```txt
Ecosystems built before primitives become weak marketplaces.
```

## Differentiation QA

Arcana should never sound like only:

```txt
an AI coding CLI
a chat wrapper
a prompt manager
a CI runner
a workflow automation tool
a dashboard for agent logs
a compliance/audit product only
```

Arcana should sound like:

```txt
a terminal-native operating layer for autonomous work
```

## Naming QA

Use strong primitive names consistently:

| Concept | Keep? | Notes |
|---|---:|---|
| Run Capsule | Yes | Strong, concrete, portable. |
| Agent Contract | Yes | Strong, enforceable. |
| Memory with Receipts | Yes | Clear and differentiated. |
| Context Supply Chain | Yes | Enterprise-relevant and original enough. |
| Agent Arena | Yes | Good if evidence-driven. |
| Skill Compiler | Yes | Stronger than skill library. |
| Tool Intelligence Layer | Maybe | Good concept, but name may be generic. |
| Agent Blackbox Recorder | Maybe | Strong metaphor, but could feel heavy. |
| Operational Intelligence Marketplace | Later | Stronger than prompt marketplace. |
| Personal Agent Runtime | Maybe | Good long-term, needs sharper near-term meaning. |

## Kill criteria

Kill or postpone an idea if:

- it requires a dashboard before the CLI primitive exists
- it creates hidden state without receipts
- it duplicates existing coding-agent behavior without making it more portable or verifiable
- it cannot be represented in a Run Capsule
- it cannot explain why it made a decision
- it requires paid services to be useful
- it sounds like compliance theater instead of execution leverage
- it increases surface area without compounding value

## QA scorecard

Use this before promoting any idea into a roadmap item.

```txt
Idea:
Layer:
Primary user:
Job-to-be-done:
What object does it create?
What evidence does it produce?
What command exposes it?
What can be replayed?
What can be compared?
What can be verified?
What can go wrong?
How does the user recover?
Why is this not just a coding-agent feature?
Why is this terminal-native?
Does it work without paid services?
Does it strengthen Arcana's foundation?
Verdict: keep / refine / delay / kill
```

## QA cycle result

After QA, the evolved focus should be:

```txt
Arcana is built around durable autonomous work objects.

Primary objects:
  Run Capsule
  Agent Contract
  Memory Receipt
  Context Source
  Route Decision
  Skill Artifact
  Tool Profile

Primary loop:
  contract → execute → record → verify → compare → remember → replay
```

This is stronger than a list of features because it defines how the system compounds.
