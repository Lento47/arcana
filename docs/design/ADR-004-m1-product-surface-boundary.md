---
document_class: architecture_decision
authority: product_surface_boundary
status: proposed
owner: maintainer
last_updated: 2026-08-05
---

# ADR-004: M1 product-surface boundary and convergence rule

## Status

Proposed.

## Context

Arcana now has several named operator and integration surfaces:

- the authoritative runtime;
- the CLI/TUI work surface;
- Arcana Desktop;
- the Arcana Manager governance discovery endpoint;
- enterprise auditor and escalation consoles;
- Arcana Control concepts;
- SDK and protocol consumers.

The underlying authority model is coherent: the runtime owns durable governance state, approval routing, PDP/PEP enforcement, evidence, and RunProofs. ADR-001 through ADR-003 define canonical governance projections, their execution boundary, and runtime-derived authority affordances.

The product boundary is less explicit. `docs/PRODUCT.md` and `docs/ROADMAP.md` define M1 as a local runtime, CLI/TUI, Desktop, one certified external-agent integration, restart recovery, and release evidence. They defer central governance, fleet productization, SIEM, ticketing, metering, and broader protocol work. At the same time, the repository already contains useful enterprise, Manager, distributed, SDK, and protocol implementations.

Without a binding surface taxonomy, implemented components can accidentally become competing products or release requirements. That creates several risks:

- TUI, Desktop, Manager, and enterprise consoles can acquire overlapping approval semantics;
- a transport adapter or discovery endpoint can be mistaken for a new authority surface;
- M1 can remain permanently unfinished while deferred tracks continue to expand;
- design-system language can diverge by surface even when the underlying state is identical;
- release evidence can become fragmented across multiple partially complete user journeys;
- existing advanced components may be rewritten merely to fit a new product label.

The problem is not lack of implementation. It is the absence of a strict rule for what constitutes the M1 product and how already-implemented adjacent capabilities relate to it.

## Decision

Arcana M1 has exactly one product journey and two user-facing clients:

1. **CLI/TUI — primary AI work surface**
   - launches or attaches to the certified external agent;
   - presents conversation, tool execution, compact governance lifecycle, and local approval controls when routing permits;
   - remains the canonical operator path for developing and diagnosing the governed agent session.

2. **Arcana Desktop — local approval and forensic companion**
   - supervises the local runtime lifecycle;
   - renders the same canonical governance semantics;
   - presents routed approvals, evidence, proofs, restart recovery, and native notifications;
   - never becomes an independent policy, approval, execution, or evidence authority.

The **Arcana Runtime** is not a third user-facing product surface. It is the authoritative local service used by both clients.

For M1:

- **Arcana Manager is a transport/discovery adapter name, not a separate product or authority surface.** Its endpoint may help a trusted client discover runtime governance routes and status, but it must converge on the same runtime contract and approval commands used by Desktop and TUI.
- **Enterprise consoles are preserved implementation tracks, not M1 release surfaces.** They may remain tested and maintained, but they do not add requirements to the M1 golden path and must not define separate approval semantics.
- **Arcana Control, central approval, distributed nodes, additional SDKs, and public protocol work remain later tracks.** Existing code is retained; no rewrite or removal is required.
- **No new named operator surface enters M1.** A new UI, manager, console, or client label requires an explicit roadmap change and a separate ADR showing why TUI or Desktop cannot satisfy the user outcome.

The M1 golden path is:

```text
launch one certified agent
  -> consequential request
  -> PDP decision
  -> durable approval when required
  -> routed inspection and approve/deny
  -> exact-request PEP revalidation
  -> at-most-once execution
  -> receipt and durable evidence
  -> RunProof inspection and verification
  -> restart/reconnect recovery without loss or duplication
```

M1 product and design review must be performed against this journey, not against the union of every implemented package.

## Shared design-system contract

All M1 surfaces use the same semantic vocabulary and states:

- request decision: `ALLOW`, `DENY`, `REQUIRE_APPROVAL`;
- approval lifecycle: `PENDING`, `APPROVED`, `CLAIMED`, `CONSUMED`, `DENIED`, `INVALIDATED`, `EXPIRED`;
- evidence health: healthy, degraded, missing, or unknown as defined by the runtime contract;
- authority actions and unavailable reasons: runtime-derived under ADR-003;
- visibility modes: conversation, operations, forensic;
- runtime error codes remain `ARC_*`; Desktop-host errors remain `DTSK_*`.

Clients may vary layout, density, input method, and navigation. They may not rename semantic states in ways that imply different authority or lifecycle behavior. In particular:

- “permission,” “approval,” “authorization,” “grant,” and “capability” are not interchangeable labels;
- a button labeled approve or deny must submit the corresponding durable runtime command;
- evaluation, simulation, escalation checks, or discovery must not be labeled as authority decisions;
- optimistic completion is prohibited; a surface shows success only after durable runtime confirmation.

## Alternatives considered

### A. Treat every implemented surface as part of M1

Rejected. It maximizes apparent feature coverage but makes release completion depend on enterprise, distributed, Manager, SDK, and protocol tracks. Integration and validation cost grows faster than product value, and the primary local user journey remains unfinished.

### B. Make Arcana Manager the primary product and absorb Desktop into it

Rejected for M1. The current architecture and separate Desktop direction already assign Rust sidecar lifecycle, local IPC, reconnection, native notifications, and packaging to Desktop. Renaming or absorbing that work would create migration effort without improving the authority model or the golden path.

This can be reconsidered as a branding decision after M1 without changing runtime semantics.

### C. Use TUI as the only M1 client

Rejected. It would reduce scope, but restart recovery, native approval availability, forensic review, and the established Desktop contract are explicit M1 outcomes. Removing Desktop now would discard completed design and implementation rather than polish it.

### D. Give each surface its own optimized governance API

Rejected. Surface-specific APIs create duplicated state mapping, stale-state rules, authentication behavior, reason codes, and approval semantics. Surface adapters may exist, but they must converge on one runtime-owned contract and command path.

### E. Remove or rewrite deferred enterprise and distributed code

Rejected. Existing implementation can remain useful and tested. The decision is about release priority and semantic ownership, not deleting advanced work.

## Consequences

### Positive

- M1 has a finite, demonstrable definition of product completeness.
- TUI and Desktop can be polished against one shared journey.
- Existing enterprise and protocol work is preserved without controlling release scope.
- Manager discovery cannot silently become a second approval system.
- UX reviews can distinguish semantic inconsistency from harmless layout differences.
- Documentation and release evidence can converge on one exact-commit demonstration.

### Negative

- Some implemented enterprise features will not be marketed or treated as M1-complete.
- Contributors must resist adding new product labels for capabilities that can be expressed through TUI, Desktop, or the runtime contract.
- The repository will continue to contain code ahead of the active product scope, requiring clear status labels.
- A future branding decision may rename Desktop or Manager, but that must remain separate from authority architecture.

## Migration plan

This decision requires no production rewrite.

1. Treat `docs/PRODUCT.md` and `docs/ROADMAP.md` as the active M1 scope and use this ADR to interpret named surfaces.
2. Complete the certified external-agent vertical slice through TUI and Desktop.
3. Add one release-evidence checklist keyed to the golden path and exact commit.
4. Audit TUI and Desktop labels against the shared semantic vocabulary; fix wording without changing runtime behavior.
5. Treat `/manager/*` endpoints as adapters over the runtime contract. Do not add Manager-only approval states or command semantics.
6. Keep enterprise and distributed suites green, but require an explicit roadmap promotion before expanding their product surfaces.
7. After M1 sign-off, decide whether “Desktop” and “Manager” are separate brands, one application, or deployment modes. That later decision must not alter the runtime authority boundary.

## Compatibility

The decision is documentation-only and additive.

It does not change:

- approval records or state transitions;
- PDP/PEP behavior;
- routes, payloads, event schemas, or protocol revisions;
- TUI layout or keyboard behavior;
- Desktop implementation;
- Manager endpoint behavior;
- enterprise consoles;
- SDKs, Rust conformance, databases, dependencies, or lockfiles.

Existing clients remain compatible. Existing advanced implementations remain in place.

## Validation

Reviewed against `phase-d-implementation` at `dc400cb5b7a66c343c4ac4a22fc783c81d26fada` after the merge of PR #78.

Evidence reviewed:

- `docs/PRODUCT.md` M1 scope and success criterion;
- `docs/ROADMAP.md` Now/Next/Later priority boundary;
- binding `docs/design/contract-first-architecture.md`;
- ADR-001 governance projection contract;
- ADR-002 projection execution boundary;
- ADR-003 runtime-derived authority affordances;
- merged Manager governance discovery endpoint;
- merged enterprise auditor and escalation consoles;
- merged CLI/TUI cross-surface bypass suite;
- current open PR set, which contains only long-lived dependency update PRs and no active product architecture change.

Static consistency checks:

- the decision preserves the runtime as sole authority;
- it does not introduce a new endpoint, state, event, package, or client;
- the golden path is a subset of the current product definition and roadmap;
- deferred implementations are preserved rather than removed or rewritten;
- no active product PR owns this decision surface.

No executable validation is applicable to this Markdown-only change. No lint, typecheck, test, or build pass totals are claimed.

## Risks and mitigations

### Risk: the boundary is interpreted as abandoning enterprise work

Mitigation: the ADR explicitly preserves existing code and tests. It limits release scope, not long-term ambition.

### Risk: Desktop and Manager branding remains confusing

Mitigation: for M1, architecture is independent of branding. Manager is treated as an adapter name; Desktop remains the defined client. A later branding ADR may rename them without changing authority semantics.

### Risk: contributors bypass the boundary by adding “small” surface-specific behavior

Mitigation: any new authority state, action, route semantics, or named operator surface requires an explicit roadmap promotion and contract review.

### Risk: shared terminology becomes too rigid for good UX

Mitigation: clients retain freedom over layout and explanatory copy. Only security-relevant semantic labels and lifecycle meaning are fixed.

## Rollback

Before implementation work depends on this ADR, rollback is deletion of this file.

After teams use the boundary, rollback requires:

1. explicitly moving the affected surface into `docs/ROADMAP.md` under Now;
2. identifying its user outcome and release acceptance evidence;
3. proving it does not create a second authority, projection, or approval implementation;
4. updating `docs/PRODUCT.md` and the binding architecture together.

Rollback may not weaken the single-runtime authority model, exact-request approval semantics, runtime-derived affordances, or fail-closed offline behavior.
