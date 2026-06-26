# Agent Operating Layer Documentation Index

This branch is documentation-first. It adds documentation, conventions, and example user-space files. It does not add runtime implementation code.

## Recommended reading order

1. [`agent-operating-layer.md`](./agent-operating-layer.md)
   - Original broad thesis and feature landscape.

2. [`agent-operating-layer-qa.md`](./agent-operating-layer-qa.md)
   - QA framework, primitive hierarchy, kill criteria, and quality scorecard.

3. [`agent-operating-layer-evolution.md`](./agent-operating-layer-evolution.md)
   - Evolved product model: prompts become contracts, sessions become capsules.

4. [`agent-operating-layer-review.md`](./agent-operating-layer-review.md)
   - Readiness review, decisions, open questions, and implementation block.

5. [`user-space-extension-model.md`](./user-space-extension-model.md)
   - User-owned extension model for `CONTRACTS.md`, `.arcana/`, contracts, modes, policies, skills, and plugins.

6. [`contracts-md.md`](./contracts-md.md)
   - `CONTRACTS.md` convention and recommended repo-level contract guide.

7. [`plugin-extension-model.md`](./plugin-extension-model.md)
   - Plugin hook model, safety levels, outputs, and QA checklist.

8. [`skill-extension-model.md`](./skill-extension-model.md)
   - Skill folder model and contract-aware capability design.

9. [`autonomy-modes.md`](./autonomy-modes.md)
   - Progressive control ladder: observe, advise, ask, enforce, locked.

10. [`implementation-strengthening-plan.md`](./implementation-strengthening-plan.md)
    - Implementation levels, rollout path, proof language, and non-blocking user experience.

11. [`progressive-mode-examples.md`](./progressive-mode-examples.md)
    - Concrete UX examples for permissive, advisory, confirmation, enforcement, and locked behavior.

12. [`agent-contracts.md`](./agent-contracts.md)
    - Object model for bounded autonomous work.

13. [`run-capsules.md`](./run-capsules.md)
    - Object model for portable autonomous work records.

14. [`context-supply-chain.md`](./context-supply-chain.md)
    - Object model for traceable context provenance.

15. [`memory-receipts.md`](./memory-receipts.md)
    - Object model for sourced, scoped, challengeable memory.

16. [`route-decisions.md`](./route-decisions.md)
    - Object model for sovereign model/provider/tool routing.

17. [`verification-records.md`](./verification-records.md)
    - Object model for separating claimed success from proven success.

## User-space examples added

```txt
CONTRACTS.md
.arcana/README.md
.arcana/modes.example.json
.arcana/contracts/README.md
.arcana/contracts/safe-refactor.contract.example.json
.arcana/contracts/dependency-change.contract.example.json
.arcana/policies/README.md
.arcana/policies/routing.policy.example.json
.arcana/skills/README.md
.arcana/skills/secure-code-review/SKILL.md
.arcana/skills/secure-code-review/contract.example.json
.arcana/plugins/README.md
.arcana/plugins/dependency-intent.plugin.example.ts
```

## Current evolved thesis

```txt
Arcana is a terminal-native operating layer for autonomous work.

It turns prompts into contracts, sessions into capsules, context into traceable supply chains, memory into receipts, and model choice into sovereign route decisions.
```

## Current user-space thesis

```txt
Arcana core provides the operating layer.
Users own their autonomy model through contracts, modes, policies, skills, and plugins.
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

## Current extension ladder

```txt
Markdown intent → JSON contracts/policies → plugins → locked/signed policies
```

| Layer | File/path | Purpose |
|---|---|---|
| Markdown | `CONTRACTS.md`, `SKILL.md` | human-readable intent |
| JSON | `.arcana/contracts`, `.arcana/policies`, `.arcana/modes.json` | machine-readable boundaries |
| Plugins | `.arcana/plugins/*.ts` | advanced custom behavior |
| Locked policies | `.arcana/policies/*.allowlist.json` | strict enterprise/user control |

## Current UX rule

```txt
Arcana should not say no first.
Arcana should say: here is the risk, here is the clean path, here is what your mode allows.
```

## QA status

```txt
Documentation status:
  strengthened with user-space extension model and concrete examples

Implementation status:
  runtime implementation still not added in this branch

Reason:
  the operating model now defines progressive modes, user-space files, concrete examples, and acceptance criteria, but runtime support still needs JSON schemas, lifecycle diagrams, composition examples, and implementation planning before code begins
```

## What to improve next

Next documentation-only improvements:

```txt
1. Add JSON schema drafts for contract, mode, policy, plugin decision, and skill metadata.
2. Add one end-to-end example: contract → mode → route → run capsule → verification → memory receipt.
3. Add capsule comparison examples.
4. Add lifecycle diagrams for the operating loop.
5. Add a migration path from existing skills to contract-aware skills.
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
