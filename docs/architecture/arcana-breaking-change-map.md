# Arcana Native Breaking Change Map

This document tracks the architectural breaks that make Arcana its own runtime rather than a cosmetic rename.

The rule is simple:

```txt
A rename changes labels.
An Arcana-native break changes authority.
```

## What Must Change

| Axis | Fork-style assumption | Arcana-native replacement | Runtime authority |
|---|---|---|---|
| Runtime identity | The process carries inherited fork identity by default. | Arcana exports native runtime identity and makes compatibility explicit. | Intent / Policy |
| Execution authority | Command handlers and chat loops implicitly own execution. | Kernel authorities own execution phases. | Policy |
| Tool execution | Tool calls execute as direct model side effects. | Tool calls become EngineAction envelopes before execution. | Risk |
| Mutation | Edit/write tools own file changes directly. | Diff gate owns proposed, approved, applied, rejected, and rolled-back mutations. | Mutation |
| Verification | The builder agent can claim completion. | Verifier evidence, limitation, or human override is required for trusted completion. | Verification |
| Proof | Evidence can be assembled after work is done. | RunProof is projected from runtime events as work happens. | Proof |
| UI truth | Conversation/UI rendering defines what happened. | TUI is a cockpit over kernel and proof state. | Proof |
| Compatibility | Fork compatibility is ambient. | Compatibility shims are explicit, opt-in, and removable. | Policy |
| Pipeline model | One loop handles every task. | Fix, feature, security, refactor, forge, and research use different pipelines. | Plan |

## Practical Meaning

Arcana should not merely rename commands, packages, banners, environment variables, or help text.

Every major migrated subsystem should answer:

1. Which Arcana authority owns this?
2. What evidence does it emit?
3. Can a user or verifier reject the claim?
4. Is mutation separated from proposal?
5. Is compatibility explicit rather than ambient?
6. Does RunProof see this as state, not prose?

If the answer is unclear, the subsystem is still fork-shaped.

## Current Code Anchors

| Code | Purpose |
|---|---|
| `packages/engine/src/kernel/kernel.ts` | Defines Arcana runtime identity and authority boundaries. |
| `packages/engine/src/kernel/breaking-change.ts` | Codifies required native breaking-change axes. |
| `packages/engine/src/index.ts` | Exposes Arcana runtime env and kernel contract at startup. |
| `packages/arcana/src/proof/types.ts` | Adds kernel identity to RunProof. |
| `packages/arcana/src/proof/create.ts` | Attaches kernel contract to proof creation. |

## Required Next Breaks

### 1. Diff Gate Before Writes

Current risk: file mutation can still be owned by tools.

Target:

```txt
agent proposes diff
→ mutation authority records proposal
→ policy decides approval/checkpoint/verifier needs
→ diff gate applies
→ RunProof records applied evidence
```

### 2. Verifier Completion Gate

Current risk: completion can still be narrative.

Target:

```txt
work finished
→ verifier checks evidence
→ verifier passes / fails / inconclusive
→ RunProof records verdict
→ completion allowed only with verifier pass, limitation, or override
```

### 3. Event-Sourced RunProof

Current risk: proof can still be manually assembled by call sites.

Target:

```txt
EngineEvent stream
→ RunProof projector
→ JSON/Markdown/TUI timeline
```

### 4. Native Pipeline Planner

Current risk: all tasks can collapse back into one chat loop.

Target:

```txt
intent
→ classify pipeline type
→ acceptance criteria
→ stages
→ budgets
→ controlled execution
```

### 5. TUI Cockpit State

Current risk: TUI can become a styled chat interface.

Target:

```txt
TUI renders authorities:
intent / plan / risk / policy / mutation / verification / rollback / proof
```

## Non-Negotiable Product Doctrine

```txt
Model proposes.
Kernel decides.
Diff gate mutates.
Verifier certifies.
RunProof records.
TUI observes.
```

That is Arcana's identity.
