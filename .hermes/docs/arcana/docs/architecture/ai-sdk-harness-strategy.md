---
title: AI SDK Harness Strategy
status: REFERENCE
created: 2026-07-29
---

# AI SDK Harness Strategy

## Summary

Vercel's @ai-sdk/workflow-harness can make Arcana broader, more durable, and easier to host. It must not replace Arcana's kernel.

## What Arcana would gain

### Harness interoperability

Arcana could operate multiple existing agent runtimes through one interface:
Arcana -> Codex harness, Claude Code harness, OpenCode harness, Pi harness, future harnesses.

### Durable remote execution

- Suspending and resuming long runs
- Surviving function/process restarts
- Persisting workflow state
- Streaming from continuing runs
- Cancellation
- Background cloud execution

### Faster cloud product development

Arcana Cloud -> start governed task -> durable workflow -> remote harness -> sandbox -> stream events back to TUI/web

## What it does NOT replace

The Vercel harness does not provide:
- Completion contracts, typed epistemic claims, proof obligations
- False-completion prevention, RunProof semantics
- Capability grants, PDP/PEP authorization
- Provenance and sensitivity controls, live revalidation
- Tamper-evident event history

The Vercel harness provides execution interoperability and lifecycle management.
Arcana provides truth, authority, evidence, and governance.

## The correct architecture

User objective -> Arcana Intent Compiler -> Completion contract -> Arcana capability PDP/PEP -> Arcana Harness Adapter -> Vercel HarnessAgent -> Codex/Claude Code/OpenCode/Pi -> Restricted sandbox -> Arcana RunProof + security events

Arcana must remain outside and above the harness.

## The largest security problem

AI SDK harnesses have two tool surfaces:
1. AI SDK-defined tools (Arcana can wrap with PEP)
2. Built-in tools exposed directly by the underlying harness runtime (may bypass PEP)

Either all consequential calls intercepted by Arcana, OR harness executes in a capability-restricted sandbox.

### Safe deployment modes

Mode A - Fully intercepted: Ideal. Arcana observes and authorizes every tool before execution.
Mode B - Sandboxed harness: Isolated disposable workspace, no host credentials, no ambient network.
Mode C - Trusted local compatibility: Allow broader local access but label honestly: PARTIAL assurance.

## Repeated effects risk

Durable workflow systems may rerun interrupted work. Use idempotency keys:
k = H(sessionId || requestHash || workflowStepId)

## Dependency strategy

No hard dependency. Use anti-corruption layer with interface ArcanaHarness.
Only the adapter imports Vercel packages.

## Recommended decision

Do not migrate to AI SDK Harness now. Build a controlled spike after Phase C enforcement is genuinely active.

## Verdict

AI SDK Harness lets Arcana run many agent engines. Arcana determines whether those engines are authorized, truthful, reproducible, and worthy of trust. That makes the SDK an accelerant, not the foundation.
