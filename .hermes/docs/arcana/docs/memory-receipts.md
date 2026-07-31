# Memory Receipts

A Memory Receipt is Arcana's object for sourced, inspectable memory.

Memory should never be vague hidden state. If memory influences an agent, Arcana should be able to show where it came from, when it was last confirmed, how confident it is, and which runs used it.

## One-line definition

```txt
A Memory Receipt makes remembered facts inspectable, sourced, scoped, and challengeable.
```

## Why it exists

Agent memory is powerful but dangerous.

Bad memory:

```txt
The project uses Cloudflare.
```

Better memory receipt:

```txt
Fact:
  The optional web app supports Cloudflare build target.

Source:
  packages/enterprise/package.json script: build:cloudflare

Confidence:
  high

Scope:
  repo

Last confirmed:
  commit abc123
```

## Memory lifecycle

```txt
observed
  ↓
proposed
  ↓
accepted | rejected
  ↓
active
  ↓
confirmed | contradicted | stale
  ↓
forgotten | archived
```

## Minimum memory fields

```txt
id
fact
source
source_type
scope
confidence
created_at
last_confirmed_at
last_used_at
related_runs
status
contradictions
```

## Conceptual schema

```ts
type MemoryReceipt = {
  id: string
  fact: string
  source: MemorySource
  sourceType: "file" | "command" | "user" | "tool" | "capsule" | "external"
  scope: "global" | "user" | "workspace" | "repo" | "project" | "session"
  confidence: "low" | "medium" | "high"
  status: "proposed" | "active" | "stale" | "contradicted" | "forgotten"
  createdAt: string
  lastConfirmedAt?: string
  lastUsedAt?: string
  relatedRuns: string[]
  contradictions: ContradictionRecord[]
}
```

This is documentation only. It does not define an implementation contract yet.

## Memory rules

### Rule 1: no source, no memory

If Arcana cannot point to a source, it should not store the memory as a trusted fact.

### Rule 2: memory must have scope

Bad:

```txt
Use Bun.
```

Good:

```txt
Use Bun for this repo because package.json declares packageManager: bun.
```

### Rule 3: memory must decay

Facts can become stale. Memory should be re-confirmed when relevant files change.

### Rule 4: memory must be challengeable

The user should be able to ask:

```sh
arcana memory why "project uses Bun"
arcana memory challenge <memory-id>
arcana memory forget <memory-id>
```

### Rule 5: memory usage must be visible

If a memory influenced a run, the Run Capsule should reference it.

## Memory operations

Potential commands:

```sh
arcana memory receipts
arcana memory why "project uses Bun"
arcana memory show <id>
arcana memory challenge <id>
arcana memory forget <id>
arcana memory confirm <id>
arcana memory stale
```

## Memory quality levels

```txt
Level 0: hidden memory
Level 1: visible memory text
Level 2: memory with source
Level 3: source + scope + confidence
Level 4: receipt linked to runs and context
Level 5: challengeable, forgettable, decay-aware memory
```

Arcana should target Level 4 first.

## Memory receipt examples

### Repo fact

```txt
Fact:
  This repo uses Bun as package manager.

Source:
  package.json packageManager field

Scope:
  repo

Confidence:
  high
```

### Product positioning fact

```txt
Fact:
  Arcana positions itself as a terminal-native operating layer for autonomous work.

Source:
  docs/agent-operating-layer-evolution.md

Scope:
  project

Confidence:
  high
```

### Risky inferred memory

```txt
Fact:
  User prefers local-first model routing.

Source:
  inferred from repeated requests, not directly stated

Scope:
  user

Confidence:
  low

Status:
  proposed, not active
```

Low-confidence inferred memory should require confirmation before influencing high-risk work.

## QA checklist

A Memory Receipt is acceptable only if it answers:

```txt
What is remembered?
Where did it come from?
Who or what produced it?
What scope does it apply to?
How confident is Arcana?
When was it last confirmed?
Which runs used it?
Can the user challenge it?
Can it be forgotten?
What would make it stale?
```

## Failure modes

### Failure mode: hidden personalization

Risk:

```txt
Agent changes behavior based on memory the user cannot see.
```

Avoid by exposing memory receipts and linking them to capsules.

### Failure mode: stale repo assumptions

Risk:

```txt
Arcana remembers a build system or architecture after the repo changed.
```

Avoid by tying memory to source files and commit state.

### Failure mode: overconfident inference

Risk:

```txt
Arcana treats inferred preferences as facts.
```

Avoid by marking inferred memory as low confidence and proposed.

### Failure mode: memory pollution

Risk:

```txt
Every run writes too many trivial memories.
```

Avoid by requiring durable usefulness and source quality.

## Product claim

```txt
Arcana memory has receipts: every remembered fact can explain its source, scope, confidence, and use.
```
