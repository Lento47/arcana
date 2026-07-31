# Agent Operating Layer Evolution

This document evolves the first Agent Operating Layer thesis into a sharper product and architecture model.

No implementation is introduced here. This is strategy, product architecture, and QA refinement.

## Evolved thesis

The first thesis was:

```txt
Arcana = terminal-native runtime for programmable autonomous work
```

The evolved thesis is:

```txt
Arcana turns autonomous work into durable, inspectable, replayable objects.
```

This is more precise. It explains what Arcana produces, not only what category it belongs to.

## The core object model

Arcana should be designed around a small set of durable objects.

```txt
Agent Contract
  defines intent, scope, constraints, success, and budget

Run Capsule
  records execution, evidence, route, context, tools, artifacts, and verification

Memory Receipt
  records what Arcana remembers, why, from where, and with what confidence

Context Source
  records where context came from, whether it is trusted, stale, or influential

Route Decision
  records why a model/tool/provider was selected or rejected

Skill Artifact
  packages a reusable capability with inputs, outputs, permissions, and tests

Tool Profile
  describes whether a tool is safe, legible, constrained, and agent-ready
```

Everything else should attach to these objects.

## The operating loop

Arcana should not be framed as a prompt-response tool.

It should be framed as an execution loop:

```txt
contract → route → execute → record → verify → compare → remember → replay
```

Expanded:

```txt
1. Contract
   User expresses desired autonomous work as constraints, not only a prompt.

2. Route
   Arcana selects model/tool/runtime based on sovereignty, cost, risk, and capability.

3. Execute
   Agent performs work inside bounded scope.

4. Record
   Arcana emits a Run Capsule with commands, diffs, context, tools, artifacts, and decisions.

5. Verify
   Arcana checks tests, constraints, output quality, dependency changes, and risk.

6. Compare
   If multiple candidates exist, Arcana compares them with evidence.

7. Remember
   Arcana writes Memory Receipts only for durable, sourced facts.

8. Replay
   Work can be inspected, resumed, forked, exported, or reproduced.
```

## Product shape

Arcana should feel less like a chat interface and more like a terminal-native autonomous workbench.

```txt
User input:
  goal, contract, or capsule

Arcana output:
  capsule, patch, artifact, receipt, route explanation, verification result
```

This is the product shift:

```txt
From: ask an agent to do something
To: create and manage autonomous work objects
```

## Command model draft

These commands are not implementation requirements yet. They define the eventual product language.

```sh
arcana contract validate auth-fix.contract.json
arcana run --contract auth-fix.contract.json
arcana capsule show run_123
arcana capsule fork run_123 --change "try without new dependency"
arcana capsule compare run_123 run_124
arcana route explain run_123
arcana context trace run_123
arcana memory why "project uses Bun"
arcana skill inspect smart-contract-audit
arcana tool profile github.create_pr
```

The CLI should expose durable objects, not only actions.

## The five hard promises

Arcana should make five promises.

### 1. Work is portable

A useful autonomous run can move across machines, users, repos, and time.

Portable means:

```txt
exportable
inspectable
resumable
comparable
replayable where possible
```

### 2. Work is explainable

Arcana can explain:

```txt
why a model was selected
why a tool was called
why context was included
why memory was used
why a dependency was added
why a run passed or failed
```

### 3. Work is bounded

Autonomy must have constraints:

```txt
allowed files
forbidden files
allowed tools
forbidden tools
budget
risk threshold
model policy
success criteria
```

### 4. Work compounds

Runs should improve future work through sourced Memory Receipts, Skill Artifacts, Tool Profiles, and Route Decisions.

### 5. Work remains sovereign

Users should control where intelligence runs, what providers are allowed, what data leaves the machine, and how memory persists.

## Arcana vs common categories

| Category | What it does | Why Arcana is different |
|---|---|---|
| Coding agent | Executes code tasks | Arcana turns execution into durable objects. |
| Chat app | Exchanges messages | Arcana manages autonomous work, not conversation. |
| CI/CD | Runs predefined jobs | Arcana works with adaptive agent execution and evidence. |
| Workflow automation | Connects deterministic steps | Arcana handles probabilistic agents with contracts and capsules. |
| Prompt library | Reuses instructions | Arcana compiles skills into operational capabilities. |
| Audit dashboard | Shows what happened | Arcana makes work replayable, comparable, and portable. |

## Innovation stack

The innovation should stack vertically.

```txt
Level 1: Durable run records
  Run Capsules

Level 2: Constrained autonomy
  Agent Contracts

Level 3: Transparent intelligence
  Route Decisions + Context Sources

Level 4: Sourced adaptation
  Memory Receipts

Level 5: Reusable capabilities
  Skill Artifacts + Tool Profiles

Level 6: Competitive execution
  Agent Arena + Worktrees

Level 7: Ecosystem
  Operational Intelligence Marketplace
```

Do not skip levels. Skipping to Level 7 before Level 1-4 are excellent would create a weak product.

## V0 documentation target

The branch should first document the object model clearly.

Required docs before implementation:

```txt
docs/agent-operating-layer.md
  original thesis and feature landscape

docs/agent-operating-layer-qa.md
  quality bar, kill criteria, primitive hierarchy

docs/agent-operating-layer-evolution.md
  evolved operating model and product language

docs/run-capsules.md
  object model for portable runs

docs/agent-contracts.md
  object model for constrained work

docs/memory-receipts.md
  object model for sourced memory

docs/context-supply-chain.md
  object model for observable context
```

## Evolved roadmap without implementation

### Documentation P0

- define Run Capsule object
- define Agent Contract object
- define Memory Receipt object
- define Context Source object
- define Route Decision object
- define QA scorecard

### Documentation P1

- define CLI language for each object
- define failure modes
- define examples
- define non-goals
- define acceptance criteria

### Documentation P2

- define how objects compose
- define lifecycle diagrams
- define enterprise story
- define local-first story
- define marketplace story

### Implementation later

Implementation should not begin until the object docs are stable enough to review.

## Product examples

### Example 1: safe refactor

```txt
Contract:
  refactor auth/session.ts

Forbidden:
  public API changes
  new dependencies
  disabled tests

Capsule records:
  prompt
  context
  route
  commands
  diffs
  tests
  contract satisfaction

Memory receipt:
  auth/session.ts owns session refresh behavior
```

### Example 2: model comparison

```txt
Contract:
  fix flaky auth tests

Arena:
  candidate A: local model
  candidate B: cloud model
  candidate C: specialist coding model

Capsule compare:
  pass/fail
  cost
  risk
  patch size
  contract satisfaction
```

### Example 3: dependency addition

```txt
Agent adds package:
  fast-glob

Arcana asks:
  why this dependency?
  why not existing glob package?
  license?
  maintainer risk?
  transitive risk?

Capsule records:
  dependency intent
  alternatives considered
  acceptance/rejection
```

## The new slogan candidates

```txt
Arcana turns autonomous work into durable objects.
```

```txt
Arcana is the operating layer for autonomous work.
```

```txt
Arcana makes agent work portable, inspectable, and replayable.
```

```txt
Arcana turns prompts into contracts and sessions into capsules.
```

Best current version:

```txt
Arcana turns prompts into contracts and sessions into capsules.
```

It is concrete, differentiated, and product-shaped.

## What to say about the fork

Use this:

```txt
OpenCode proved the terminal-native agent model.
Arcana diverged to build the operating layer for governed, portable autonomous work.
```

Avoid this:

```txt
OpenCode was too narrow.
```

Reason:

```txt
The stronger story is architectural divergence, not criticism.
```

## Strategic focus after QA

The new top five should be:

```txt
1. Run Capsules
2. Agent Contracts
3. Memory with Receipts
4. Context Supply Chain
5. Sovereign Model Routing
```

Agent Arena, Worktrees, Skill Compiler, Tool Intelligence, and Marketplace should build on top of those.

## Final evolved north star

```txt
Arcana is a terminal-native operating layer for autonomous work.

It turns prompts into contracts, sessions into capsules, context into traceable supply chains, memory into receipts, and model choice into sovereign route decisions.
```
