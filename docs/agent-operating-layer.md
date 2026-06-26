# Arcana Agent Operating Layer

Arcana began with a terminal-native agent foundation. The next product direction is bigger than governance alone: Arcana should become a runtime for programmable autonomous work.

## Category thesis

```txt
OpenCode helps agents code.
Arcana turns agent work into an operating system.
```

Arcana should make agent work portable, replayable, remixable, delegatable, inspectable, sovereign, and verifiable.

Governance remains one pillar, but the bigger category is:

```txt
Arcana = terminal-native runtime for programmable autonomous work
```

## Product pillars

1. Run Capsules
2. Agent Worktrees
3. Agent Arena
4. Sovereign Model Routing
5. Context Supply Chain
6. Skill Compiler
7. Tool Intelligence Layer
8. Agent Blackbox Recorder
9. Personal Agent Runtime
10. Memory with Receipts
11. Code Archaeology
12. Agent Contracts
13. Dependency Intent System
14. Local Machine-Aware Agent
15. Operational Intelligence Marketplace

## 1. Run Capsules

A Run Capsule is a portable, replayable unit of agent work.

```txt
Run Capsule
  ├─ goal
  ├─ repo snapshot
  ├─ context used
  ├─ tools used
  ├─ model route
  ├─ commands
  ├─ diffs
  ├─ artifacts
  ├─ errors
  ├─ recovery steps
  ├─ tests
  └─ final proof
```

Potential commands:

```sh
arcana capsule list
arcana capsule show <id>
arcana capsule replay <id>
arcana capsule fork <id> --change "use Postgres instead"
arcana capsule verify <id>
arcana capsule export <id>
arcana capsule compare <a> <b>
```

Product claim:

```txt
Arcana turns agent sessions into portable execution capsules.
```

## 2. Agent Worktrees

Arcana should treat parallel agent execution as a first-class workflow.

```txt
arcana spawn 5 "fix flaky auth tests"
  ├─ candidate-a
  ├─ candidate-b
  ├─ candidate-c
  ├─ candidate-d
  └─ candidate-e
```

Each agent receives:

```txt
isolated worktree
own model route
own budget
own permissions
own memory scope
own verification path
own capsule
```

Goal: make multi-agent work manageable instead of chaotic.

## 3. Agent Arena

The Agent Arena lets multiple models, tools, or strategies compete on the same task.

```sh
arcana arena "fix flaky auth tests" \
  --agents claude,codex,local \
  --judge tests \
  --budget 5
```

Example output:

```txt
Agent        Cost     Tests     Risk     Patch size     Verdict
Claude       $1.20    PASS      low      4 files        winner
Codex        $0.80    FAIL      medium   7 files        rejected
Local        $0.00    PASS      high     19 files       needs review
```

Product claim:

```txt
Arcana does not ask which model you like. It proves which agent performed best.
```

## 4. Sovereign Model Routing

Arcana should let users control which intelligence touches their code, data, and tools.

Routing modes:

```txt
local-first
private-cloud
cheap
best-coding
no-us-provider
no-training
enterprise-approved
airgapped
manual-only
```

Potential commands:

```sh
arcana sovereignty set strict
arcana route "rewrite this module" --policy local-first
arcana route "security review" --policy no-logging
arcana route "generate docs" --policy cheapest
```

Product claim:

```txt
Arcana gives users sovereignty over their intelligence supply chain.
```

## 5. Context Supply Chain

Context should be observable, trusted, and removable.

Arcana should track:

```txt
where context came from
who wrote it
whether it is stale
whether it is trusted
whether it affected the output
whether it was retrieved, injected, summarized, or generated
whether the result can be reproduced without it
```

Potential commands:

```sh
arcana context trace
arcana context diff
arcana context trust <source>
arcana context prune
arcana context poison-scan
```

Product claim:

```txt
Arcana makes context observable.
```

## 6. Skill Compiler

Skills should evolve from Markdown instructions into executable capabilities.

```txt
skill.md
  ↓
Arcana Skill Compiler
  ↓
typed workflow
  ↓
tool permissions
  ↓
test fixture
  ↓
verification contract
  ↓
reusable agent capability
```

A compiled skill should define:

```txt
inputs
outputs
tools required
risk level
model preference
examples
failure modes
verification command
artifact schema
```

Potential commands:

```sh
arcana skill compile smart-contract-audit
arcana skill test smart-contract-audit --fixture uniswap-v2
arcana skill publish smart-contract-audit.arcana
```

Product claim:

```txt
Arcana turns prompts into operational capabilities.
```

## 7. Tool Intelligence Layer

Arcana should judge whether tools are legible and safe for agents.

Potential commands:

```sh
arcana mcp inspect
arcana mcp score
arcana mcp repair-descriptions
arcana mcp simulate
arcana mcp minimize
```

The system should flag:

```txt
vague tool purpose
missing examples
unsafe write operations
ambiguous read/write semantics
missing constraints
missing failure modes
missing auth assumptions
```

Product claim:

```txt
Arcana makes tools legible to agents.
```

## 8. Agent Blackbox Recorder

Arcana should record not only what happened, but what the agent saw, believed, ignored, tried, and used as evidence.

Potential commands:

```sh
arcana blackbox inspect <run>
arcana blackbox why <run> "deleted auth.ts"
arcana blackbox rewind <run> --before "npm install"
```

Product claim:

```txt
Arcana is not only for controlling agents. It is for debugging agency.
```

## 9. Personal Agent Runtime

Arcana should be user-centric, not app-centric.

The runtime owns:

```txt
your memory
your tools
your preferences
your approved models
your local machine profile
your work patterns
your risk tolerance
your agent identities
```

Potential commands:

```sh
arcana identity create security-researcher
arcana identity create frontend-builder
arcana identity create release-manager
arcana run as security-researcher "audit this repo"
```

Each identity has:

```txt
model preferences
skills
tool access
memory scope
budget
style
verification rules
risk appetite
```

Product claim:

```txt
Arcana is the personal operating system for your agents.
```

## 10. Memory with Receipts

Memory must never become vague hidden state.

Every memory should have:

```txt
remembered fact
source
confidence
first seen
last confirmed
related runs
scope
ability to challenge
ability to delete
```

Potential commands:

```sh
arcana memory why "project uses Bun"
arcana memory forget "old deployment target"
arcana memory pin "Arcana uses governed autonomy positioning"
```

Product claim:

```txt
Arcana memory has receipts.
```

## 11. Autonomous Code Archaeology

Arcana should explain why a codebase became the way it is.

Potential commands:

```sh
arcana archaeology "why is this module like this?"
arcana archaeology --file auth/session.ts
arcana archaeology --bug "login loop"
```

The system inspects:

```txt
git history
renames
issues
PRs
test changes
dependency changes
design drift
```

Product claim:

```txt
Arcana performs agentic software forensics.
```

## 12. Agent Contracts

Arcana should move from vague prompts to executable contracts.

```txt
Goal:
  fix flaky auth tests

Allowed:
  edit test files
  edit auth/session.ts

Forbidden:
  change public API
  add dependency
  disable tests

Success:
  bun test auth passes 5 times
  no snapshot deletion
  no new dependency

Budget:
  20 minutes
  $3 max
```

Potential command:

```sh
arcana contract run auth-fix.contract.json
```

Product claim:

```txt
Arcana replaces vague prompts with executable contracts.
```

## 13. Dependency Intent System

When an agent adds a dependency, Arcana should ask why.

Questions:

```txt
Why this dependency?
Why not stdlib?
Why not an existing package?
What license?
What maintenance risk?
What install size?
What transitive risk?
What maintainer health?
```

Potential commands:

```sh
arcana dep justify zod
arcana dep alternatives left-pad
arcana dep risk @random/package
```

Product claim:

```txt
Arcana provides dependency intelligence, not only dependency governance.
```

## 14. Local Machine-Aware Agent

Arcana should adapt to the machine it runs on.

Detected profile:

```txt
RAM
GPU
CPU
disk
OS
shell
terminal
installed tools
available local models
repo size
expected task cost
```

Potential commands:

```sh
arcana machine profile
arcana model recommend
arcana run --local-first
```

Product claim:

```txt
Arcana adapts autonomy to the machine it runs on.
```

## 15. Operational Intelligence Marketplace

Arcana should not build a generic prompt marketplace.

It should distribute:

```txt
verified skills
execution capsules
contracts
tool profiles
model routing policies
review policies
security workflows
```

Potential commands:

```sh
arcana install skill smart-contract-audit
arcana install contract safe-refactor
arcana install policy startup-local-first
```

Each asset should include:

```txt
tests
examples
license
creator
trust score
last verified
compatible Arcana version
required tools
```

Product claim:

```txt
Arcana marketplace sells operational intelligence, not prompts.
```

## First build targets

The first implementation branch should prioritize durable primitives over UI polish.

### P0: Concepts and data shapes

- Run Capsule schema
- Agent Contract schema
- Context source schema
- Memory receipt schema
- Sovereignty policy schema

### P1: CLI prototypes

- `arcana capsule list/show`
- `arcana contract validate`
- `arcana memory why`
- `arcana context trace`
- `arcana route explain`

### P2: Execution integration

- emit capsule metadata from normal runs
- attach command/tool/model/context events to capsules
- bind contracts to runs
- record memory receipts
- explain model route decisions

### P3: Multi-agent layer

- worktree runner
- arena runner
- candidate comparison
- verification scoring

## Non-goals for this branch

- Do not build a dashboard-first product.
- Do not turn this into only compliance tooling.
- Do not create a prompt marketplace.
- Do not hide agent state in opaque memory.
- Do not require paid services.
- Do not make governance the whole product identity.

## North star

```txt
The future is not one agent in one chat.

The future is many agents, many models, many tools, many contexts, many workflows, and many proofs.

Arcana should be the runtime that makes all of that usable.
```
