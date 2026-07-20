# Arcana Out of Scope

Arcana is becoming a governed autonomy runtime. The following work is intentionally out of scope because it pulls the product back toward a cosmetic fork, a generic chat tool, or an unsafe agent loop.

## Out of Scope Now

### Cosmetic Rename Work

Renaming strings, commands, banners, package names, or help text is not enough.

A change only counts as Arcana-native when it changes authority, evidence, policy, verification, mutation flow, or proof state.

### Hiding Fork Lineage

Arcana should not hide license history, attribution, or upstream origin.

The goal is architectural independence, not dishonest erasure.

### Big-Bang Rewrite

Rewriting the entire runtime at once is out of scope.

Arcana should migrate authority by authority:

```txt
intent -> plan -> action -> risk -> policy -> mutation -> verification -> proof
```

### Generic Chat Assistant Features

Arcana is not trying to become another chat-first coding assistant.

Out of scope:

- chat polish without runtime authority
- conversation features that do not emit evidence
- model-only completion claims
- UI-first state that is not backed by engine state

### TUI as Source of Truth

The TUI is a cockpit, not the authority.

The TUI must render kernel, policy, mutation, verification, rollback, and proof state. It must not invent state.

Current default presentation: [command-spine-ui.md](./command-spine-ui.md). Performance work that only polishes chrome without stable projections is also out of scope — see [arcana-performance-optimization-foundation.md](./arcana-performance-optimization-foundation.md).

### Direct Ungoverned Mutation

Long term, file writes should not be owned by tools directly.

Tools may propose. The mutation authority decides whether a change is approved, applied, verified, rejected, or reverted.

### Self-Certified Completion

The same agent that created a change should not be the only authority that declares completion.

Trusted completion needs verifier evidence, explicit limitation, or human override.

### Ambient Legacy Compatibility

Compatibility with old fork assumptions must be explicit and removable.

Out of scope:

- always-on legacy environment identity
- implicit fork-shaped plugin assumptions
- compatibility shims with no migration path

### Security as Optional Mode

Security cannot be a special prompt or optional mode.

Security-sensitive actions should affect risk, policy, approval, verifier, and RunProof state by default.

## Out of Scope Later Unless Proven Necessary

### Cloud-Only Control Plane

Arcana should work as a local/native runtime first.

Cloud services may support collaboration, licensing, sync, or enterprise governance, but the core runtime should not require cloud authority.

### Model Vendor Lock-In

Arcana should not be architected around one frontier model, provider, or API style.

The runtime should treat models as replaceable proposal engines behind policy and verification.

### Dashboard-First Product Direction

A web dashboard may exist for enterprise visibility, but it should not define the runtime.

The primary product identity is governed execution, visible in CLI/TUI and backed by RunProof.

## Rule of Thumb

If a feature does not answer at least one of these questions, it is probably out of scope:

1. Which Arcana authority owns this?
2. What evidence does it emit?
3. Does it change risk, policy, mutation, verification, rollback, or proof state?
4. Can the user audit or reject it?
5. Can RunProof represent it without prose-only interpretation?

## In Scope Instead

Arcana-native work should focus on:

- kernel contracts
- execution envelopes
- risk engine
- policy bridge
- mutation authority
- verifier authority
- RunProof projection
- pipeline planner
- TUI cockpit state
- explicit compatibility shims

The product doctrine remains:

```txt
Model proposes.
Kernel decides.
Diff gate mutates.
Verifier certifies.
RunProof records.
TUI observes.
```
