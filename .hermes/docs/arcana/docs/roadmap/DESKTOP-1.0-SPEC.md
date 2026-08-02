---
document_class: roadmap_spec
authority: reference
status: SPEC_ONLY
status_source: docs/STATUS.md
last_verified: 2026-08-02
implementation_status: NOT IMPLEMENTED
frozen_scope: product_scope_and_security_boundaries
frozen_api_contract: false
---

# Arcana Desktop 1.0 — Local Operator Workstation (Specification)

**Status: SPECIFICATION ONLY — approved as a roadmap track, NOT implemented.
Desktop is not required for Arcana 1.0 and must not delay the first release.**

## Freeze semantics

**FROZEN in this specification:**

- Product responsibility and the Desktop/Control distinction
- Relationship to Runtime, Node, and the trusted computing base
- Security nonclaims (Desktop cannot authorize, execute, or fabricate proof)

**NOT FROZEN:**

- The daemon/API wire contract and event/SSE details in §§4–5 are a
  directional baseline, not a frozen contract. They may evolve during CLI 1.0
  and external-adapter work; Desktop-1 binds to the contract that is stable
  at implementation time.

## 1. Product responsibility

Local operator application for one machine or a small local environment:

- Launch and manage agent sessions
- View the Command Spine
- Approve and deny requests
- Inspect capabilities
- Inspect exact authorization requests
- Explore RunProof
- Manage local workspaces
- Configure providers and models
- View local node health
- Manage local artifacts
- Open an embedded terminal/TUI
- Receive native approval and recovery notifications

## 2. Relationship to Runtime, Node, and Control

```text
Desktop = local operator workstation
Control = remote enterprise governance plane
```

- **Arcana Desktop** is a client of the local Arcana API on one machine or a
  small local environment.
- **Arcana Control** is the organization/fleet governance plane: multiple
  nodes, organization identities, policy distribution, central approvals,
  remote revocation, fleet status, proof archive, compliance exports,
  incident response, federation.
- Desktop never owns policy, capability state, approval state, or effect
  execution — those stay in the runtime.

## 3. Product stack

```text
Arcana Runtime
├── Arcana CLI
├── Arcana TUI
├── Arcana Desktop
├── Arcana Node
├── Arcana SDK
└── Arcana Control
```

## 4. API boundaries

The path is fixed:

```text
Arcana Desktop
→ local Arcana API
→ runtime command service
→ durable authorization state
→ PDP
→ PEP
→ exact effect
→ evidence
```

The desktop process has no direct database access. Local database ownership
(grant store, intent bindings, approvals, event store) belongs to the runtime.

> **Not a frozen wire contract.** This path describes the architectural
> direction; exact request/response and SSE payload shapes stabilize during
> CLI 1.0 and external-adapter work.

## 5. Event/SSE contract

- Subscribe to the same SSE stream as the TUI (`governance.recorded`,
  `approval.updated`, message events, trace health).
- Reconnect/resync semantics mirror TUI-2.1: heartbeat liveness, gap-closer,
  REST resync on reconnect.
- The desktop renders engine state; it never invents truth.

> **Not a frozen wire contract.** Event names and payload shapes may evolve;
> Desktop-1 consumes the stabilized contract.

## 6. Approval command path

Approval UI → local API command endpoint → `ApprovalOperatorService` → durable
state transition → runtime worker → PEP revalidation → exact effect. This is
the same authority boundary as TUI-2.1.

## 7. RunProof presentation

Proof axes, evidence gaps, event inspection, and verification states.
Degraded/unavailable evidence is fail-visible; absent evidence is never
presented as healthy.

## 8. Local database ownership

The runtime owns all durable governance state. Desktop persists only UI
preferences and credentials (OS keychain), never authorization or approval
state.

## 9. Offline behavior

The local daemon remains the authority. Desktop offline mode is
presentation-only: no cached authority decisions and no deferred approvals
without the runtime.

## 10. Native notification behavior

Notifications cover approval requests, recovery events, and proof
degradation. A notification is a request to open the desktop — it is never an
authorization.

## 11. Update/install strategy

Signed installers, atomic updates, and rollback; a desktop update channel
separate from the runtime version. Details are finalized in Desktop-6/7.

## 12. Security nonclaims and TCB boundary

- Desktop **can** request, inspect, approve, deny, and revoke.
- Desktop **cannot** authorize by itself, execute by itself, or fabricate
  proof.
- The desktop frontend stays outside the trusted computing base as much as
  possible. Trusted components remain: authorization stores, PEP adapters,
  event store, RunProof projection, and canonical serializer
  (`docs/security/TRUSTED-COMPUTING-BASE.md`).
- Desktop adds no new physical containment surface; effect coverage is
  unchanged (`docs/security/EFFECT-COVERAGE.md`).

## 13. Roadmap workstreams

### Desktop-1: Runtime connection

Local daemon discovery, health, reconnect, session listing.

### Desktop-2: Session and Command Spine

Conversation, execution, governance aggregation, artifacts.

### Desktop-3: Authority operations

Approvals, denials, capability inspection, revocation.

### Desktop-4: RunProof

Proof axes, evidence gaps, event inspection, verification.

### Desktop-5: Workspace and provider management

Local workspace trust, models, providers, budgets.

### Desktop-6: Native operations

Notifications, deep links, updates, diagnostics, crash recovery.

### Desktop-7: Production polish

Accessibility, performance, signing, installer, updates, recovery.

## 14. Priority and sequencing

```text
1. Finish and freeze TUI-2.1
2. Stabilize CLI 1.0
3. Stabilize the local daemon/API/event contract
4. Build one real external CLI adapter
5. Start Arcana Desktop
6. Complete Node 1.0
7. Build Arcana Control
```

The external adapter precedes Desktop because Arcana's core thesis is
cross-runtime governance: prove `arcana launch codex | claude | gemini`
before building a rich local shell around a single runtime.

## 15. Arcana 1.0 definition

```text
Arcana 1.0
= secure local runtime + CLI/TUI + one external adapter

Arcana Desktop 1.0
= subsequent local-product expansion
```
