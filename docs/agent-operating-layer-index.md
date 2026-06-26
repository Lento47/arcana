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

5. [`adr/0001-agent-operating-layer.md`](./adr/0001-agent-operating-layer.md)
   - Architecture decision record for Arcana as an Agent Operating Layer.

6. [`end-to-end-examples.md`](./end-to-end-examples.md)
   - Full flows showing contract, mode, route, capsule, verification, and memory interaction.

7. [`object-schemas.md`](./object-schemas.md)
   - Draft object shapes for contracts, capsules, routes, verification, memory, context, plugins, and skills.

8. [`user-space-extension-model.md`](./user-space-extension-model.md)
   - User-owned extension model for `CONTRACTS.md`, `.arcana/`, contracts, modes, policies, skills, and plugins.

9. [`contracts-md.md`](./contracts-md.md)
   - `CONTRACTS.md` convention and recommended repo-level contract guide.

10. [`plugin-extension-model.md`](./plugin-extension-model.md)
    - Plugin hook model, safety levels, outputs, and QA checklist.

11. [`plugin-permissions.md`](./plugin-permissions.md)
    - Draft permission model for plugins.

12. [`skill-extension-model.md`](./skill-extension-model.md)
    - Skill folder model and contract-aware capability design.

13. [`trust-boundaries.md`](./trust-boundaries.md)
    - Trust-boundary model for data, tools, models, plugins, memory, context, and external routes.

14. [`resolution-and-recovery.md`](./resolution-and-recovery.md)
    - Warning, confirmation, block, denial, proof language, and approved next-step UX.

15. [`case-usage-cookbook.md`](./case-usage-cookbook.md)
    - User cases for solo founders, maintainers, enterprise teams, support, release, docs, and local-only work.

16. [`adoption-levels.md`](./adoption-levels.md)
    - Gradual adoption path from normal agent usage to locked controlled autonomy.

17. [`tool-risk-model.md`](./tool-risk-model.md)
    - Tool risk classes and mode-aware behavior.

18. [`autonomy-modes.md`](./autonomy-modes.md)
    - Progressive control ladder: observe, advise, ask, enforce, locked.

19. [`implementation-strengthening-plan.md`](./implementation-strengthening-plan.md)
    - Implementation levels, rollout path, proof language, and non-blocking user experience.

20. [`progressive-mode-examples.md`](./progressive-mode-examples.md)
    - Concrete UX examples for permissive, advisory, confirmation, enforcement, and locked behavior.

21. [`agent-contracts.md`](./agent-contracts.md)
    - Object model for bounded autonomous work.

22. [`run-capsules.md`](./run-capsules.md)
    - Object model for portable autonomous work records.

23. [`context-supply-chain.md`](./context-supply-chain.md)
    - Object model for traceable context provenance.

24. [`memory-receipts.md`](./memory-receipts.md)
    - Object model for sourced, scoped, challengeable memory.

25. [`route-decisions.md`](./route-decisions.md)
    - Object model for sovereign model/provider/tool routing.

26. [`verification-records.md`](./verification-records.md)
    - Object model for separating claimed success from proven success.

## User-space examples added

```txt
CONTRACTS.md
.arcana/README.md
.arcana/modes.example.json
.arcana/contracts/README.md
.arcana/contracts/safe-refactor.contract.example.json
.arcana/contracts/dependency-change.contract.example.json
.arcana/contracts/docs-update.contract.example.json
.arcana/contracts/release-readiness.contract.example.json
.arcana/policies/README.md
.arcana/policies/routing.policy.example.json
.arcana/policies/memory.policy.example.json
.arcana/policies/context.policy.example.json
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
  strengthened with user-space extension model, object schemas, trust boundaries, adoption path, ADR, and concrete examples

Implementation status:
  runtime implementation still not added in this branch

Reason:
  the operating model now defines progressive modes, user-space files, concrete examples, schemas, and acceptance criteria, but runtime support still needs lifecycle diagrams, composition examples, and implementation sequencing before code begins
```

## What to improve next

Next documentation-only improvements:

```txt
1. Add capsule comparison examples.
2. Add lifecycle diagrams for the operating loop.
3. Add a migration path from existing skills to contract-aware skills.
4. Add command UX examples for `arcana contract`, `arcana capsule`, `arcana mode`, and `arcana route`.
5. Add implementation sequencing for a small event-first runtime.
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
