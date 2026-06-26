# Agent Operating Layer Documentation Index

This branch is documentation-only. It does not add implementation code.

## Recommended reading order

1. [`agent-operating-layer.md`](./agent-operating-layer.md)
   - Original broad thesis and feature landscape.

2. [`agent-operating-layer-qa.md`](./agent-operating-layer-qa.md)
   - QA framework, primitive hierarchy, kill criteria, and quality scorecard.

3. [`agent-operating-layer-evolution.md`](./agent-operating-layer-evolution.md)
   - Evolved product model: prompts become contracts, sessions become capsules.

4. [`agent-operating-layer-review.md`](./agent-operating-layer-review.md)
   - Readiness review, decisions, open questions, and implementation block.

5. [`autonomy-modes.md`](./autonomy-modes.md)
   - Progressive control ladder: observe, advise, ask, enforce, locked.

6. [`implementation-strengthening-plan.md`](./implementation-strengthening-plan.md)
   - Implementation levels, rollout path, proof language, and non-blocking user experience.

7. [`progressive-mode-examples.md`](./progressive-mode-examples.md)
   - Concrete UX examples for permissive, advisory, confirmation, enforcement, and locked behavior.

8. [`agent-contracts.md`](./agent-contracts.md)
   - Object model for bounded autonomous work.

9. [`run-capsules.md`](./run-capsules.md)
   - Object model for portable autonomous work records.

10. [`context-supply-chain.md`](./context-supply-chain.md)
    - Object model for traceable context provenance.

11. [`memory-receipts.md`](./memory-receipts.md)
    - Object model for sourced, scoped, challengeable memory.

12. [`route-decisions.md`](./route-decisions.md)
    - Object model for sovereign model/provider/tool routing.

13. [`verification-records.md`](./verification-records.md)
    - Object model for separating claimed success from proven success.

## Current evolved thesis

```txt
Arcana is a terminal-native operating layer for autonomous work.

It turns prompts into contracts, sessions into capsules, context into traceable supply chains, memory into receipts, and model choice into sovereign route decisions.
```

## Current implementation thesis

```txt
Arcana should work before it enforces.

First it records.
Then it advises.
Then it asks.
Then it enforces.
Then it locks down.

The user chooses the level.
```

## Current object model

```txt
Agent Contract
  defines intent, scope, constraints, success, and budget

Run Capsule
  records execution, evidence, route, context, tools, artifacts, and verification

Context Source
  records where context came from, whether it is trusted, stale, or influential

Memory Receipt
  records what Arcana remembers, why, from where, and with what confidence

Route Decision
  records why a model/tool/provider was selected or rejected

Verification Record
  records whether agent claims were proven, failed, skipped, or inconclusive
```

## Current operating loop

```txt
contract → route → execute → record → verify → compare → remember → replay
```

## Current autonomy ladder

```txt
observe → advise → ask → enforce → locked
```

| Mode | Default behavior |
|---|---|
| Observe | record without blocking |
| Advise | warn and suggest, continue by default |
| Ask | confirm at risk boundaries |
| Enforce | block policy and contract violations |
| Locked | allow only pre-approved paths |

## Current UX rule

```txt
Arcana should not say no first.
Arcana should say: here is the risk, here is the clean path, here is what your mode allows.
```

## QA status

```txt
Documentation status:
  improving, coherent enough for further review

Implementation status:
  implementation design strengthened, runtime implementation still not added in this branch

Reason:
  the operating model now defines progressive modes, concrete examples, and acceptance criteria, but still needs JSON examples, lifecycle diagrams, and composition examples before runtime work begins
```

## What to improve next

Next documentation-only improvements:

```txt
1. Add JSON examples for P0 objects.
2. Add one end-to-end example: contract → mode → route → run capsule → verification → memory receipt.
3. Add route policy examples for local-first, no-training, and enterprise-approved modes.
4. Add capsule comparison examples.
5. Add lifecycle diagrams for the operating loop.
```

## Non-goals for this branch

```txt
No runtime implementation.
No dashboard work.
No marketplace work.
No paid service requirements.
No PR/merge automation.
No provider-specific integration changes.
```
