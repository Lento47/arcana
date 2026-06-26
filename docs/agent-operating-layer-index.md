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

5. [`agent-contracts.md`](./agent-contracts.md)
   - Object model for bounded autonomous work.

6. [`run-capsules.md`](./run-capsules.md)
   - Object model for portable autonomous work records.

7. [`context-supply-chain.md`](./context-supply-chain.md)
   - Object model for traceable context provenance.

8. [`memory-receipts.md`](./memory-receipts.md)
   - Object model for sourced, scoped, challengeable memory.

9. [`route-decisions.md`](./route-decisions.md)
   - Object model for sovereign model/provider/tool routing.

10. [`verification-records.md`](./verification-records.md)
    - Object model for separating claimed success from proven success.

## Current evolved thesis

```txt
Arcana is a terminal-native operating layer for autonomous work.

It turns prompts into contracts, sessions into capsules, context into traceable supply chains, memory into receipts, and model choice into sovereign route decisions.
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

## QA status

```txt
Documentation status:
  improving, coherent enough for further review

Implementation status:
  blocked

Reason:
  object model still needs examples, JSON shapes, lifecycle diagrams, and composition examples before runtime work begins
```

## What to improve next

Next documentation-only improvements:

```txt
1. Add JSON examples for P0 objects.
2. Add one end-to-end example: contract → run capsule → verification → memory receipt.
3. Add route policy examples for local-first, no-training, and enterprise-approved modes.
4. Add capsule comparison examples.
5. Add failure-case examples.
```

## Non-goals for this branch

```txt
No implementation.
No dashboard work.
No marketplace work.
No paid service requirements.
No PR/merge automation.
No provider-specific integration changes.
```
