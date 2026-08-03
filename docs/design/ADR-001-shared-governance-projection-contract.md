# ADR-001: Shared Governance Projection Contract

- **Status:** Proposed
- **Date:** 2026-08-03
- **Decision owners:** Arcana runtime, TUI, and Desktop architecture
- **Scope:** Presentation contracts for governance events; no authority or execution behavior

## Context

Arcana already has a binding authority model:

- the runtime owns durable governance state;
- the TUI and Desktop are independent projections of the same durable log;
- `contracts/events.v1.json` defines event identity, aggregation groups, and security-breakthrough events;
- three visibility modes are required: conversation, operations, and forensic.

The missing architectural boundary is the projection output itself. Today, each surface can independently interpret event grouping, severity, labels, stale/degraded state, ordering, and disclosure rules. That creates a high-risk form of design drift:

- the TUI may collapse a lifecycle that Desktop expands;
- one surface may render degraded evidence as healthy;
- security-breakthrough events may receive different prominence;
- copy, glyph, severity, and state terminology may diverge;
- future clients may reimplement event interpretation from raw payloads.

This is not only a visual consistency problem. Presentation is part of the governance safety model because operators act on what the surface communicates. A client must not be able to make an authoritative event look harmless, complete, current, or successful when it is not.

## Decision

Arcana will define one **surface-neutral governance projection contract** in the runtime repository. The TUI, Desktop, and future clients will render that projection rather than independently deriving governance meaning from raw events.

The projection contract will be versioned separately from the transport event catalog. The runtime remains the source of truth for event semantics and projection classification. Clients retain control over layout, typography, interaction patterns, and platform-specific affordances.

The contract must describe semantic output, not pixels.

### Required projection fields

A projected governance item must contain at least:

```ts
type GovernanceProjectionItem = {
  projectionVersion: string
  id: string
  sequenceStart: number
  sequenceEnd: number
  mode: "conversation" | "operations" | "forensic"
  category:
    | "authorization"
    | "approval"
    | "execution"
    | "evidence"
    | "proof"
    | "runtime"
  severity: "info" | "notice" | "warning" | "critical"
  state:
    | "pending"
    | "allowed"
    | "denied"
    | "expired"
    | "revoked"
    | "executed"
    | "degraded"
    | "unknown"
    | "failed"
  summary: string
  detailRef?: string
  stale: boolean
  breakthrough: boolean
  sourceEventTypes: string[]
}
```

The eventual machine-readable schema may refine names and enumerations, but it must preserve these semantic responsibilities.

### Invariants

1. **No invented authority**  
   A projection may summarize or group events, but it may not introduce an approval, decision, execution, identity, proof level, or success state absent from the source log.

2. **No false health**  
   Degraded, stale, missing, disconnected, unknown, denied, revoked, expired, or failed state may never render as healthy or complete.

3. **Breakthrough preservation**  
   Every event listed in `securityBreakthrough` renders as an individual projected item in every visibility mode. It cannot be absorbed into a healthy aggregate.

4. **Sequence traceability**  
   Every projected item records the exact inclusive source sequence range and source event types. Forensic mode can resolve back to the canonical events.

5. **Deterministic grouping**  
   Given the same ordered event sequence, projection version, and visibility mode, all conforming clients receive equivalent semantic projection items.

6. **Layout independence**  
   The contract does not prescribe cards, rails, windows, panels, colors, font sizes, or platform controls. TUI and Desktop can remain visually distinct.

7. **Authority remains server-side**  
   Projection output is presentation data. It does not grant permission, validate a decision, consume an approval, or authorize an effect.

### Ownership boundary

The runtime repository owns:

- projection schema and version;
- event-to-category mapping;
- severity and state classification;
- grouping rules;
- breakthrough behavior;
- stale/degraded semantics;
- deterministic fixtures.

The TUI and Desktop own:

- spatial layout;
- typography and responsive behavior;
- input methods and navigation;
- platform notifications;
- animation and visual density;
- accessibility implementation;
- local non-authoritative display preferences.

Clients may choose to show more detail than the current mode requires. They may not hide required breakthrough items or weaken semantic severity/state.

## Alternatives considered

### A. Keep projection logic in each client

**Rejected.** Lowest immediate cost, but guarantees semantic drift as clients evolve independently. It also makes every new surface a fresh governance implementation.

### B. Send fully rendered strings or terminal markup from the runtime

**Rejected.** This would couple the runtime to layout, localization, accessibility, and platform constraints. It would make Desktop and TUI visually identical in the wrong way and move presentation concerns into the authority service.

### C. Share a UI component library across TUI and Desktop

**Rejected as the architectural solution.** The surfaces use different rendering stacks and interaction models. Shared components do not solve semantic classification and would create unnecessary technology coupling.

### D. Treat `contracts/events.v1.json` as sufficient

**Rejected.** The event catalog defines source events and some grouping metadata, but it does not fully define projection state, severity, stale behavior, sequence ranges, or deterministic output across visibility modes.

## Compatibility and migration

This decision is additive. Existing event transport and approval APIs remain unchanged.

Migration should occur in four bounded stages:

1. Add a versioned machine-readable projection schema and deterministic fixture corpus.
2. Implement a pure runtime projection function from ordered canonical events to semantic projection items.
3. Migrate the TUI mapper to consume or conform to the projection contract while preserving the command-spine layout.
4. Generate or consume the same projection types in Desktop and add cross-client fixture tests.

During migration, existing clients may continue using their current mappers, but no new client-specific governance semantics should be added. Any necessary semantic rule must be added to the shared contract first.

### Versioning

- Additive optional fields may remain within a projection revision.
- New required fields, changed enum meaning, changed grouping behavior, or changed breakthrough behavior require a projection revision bump.
- A projection-version mismatch must be observable. Clients may fall back to forensic/raw-event rendering, but may not silently reinterpret unknown semantics as healthy.

## Validation requirements

Before this ADR can move to Accepted, implementation work must provide:

- deterministic fixtures for all event types in `contracts/events.v1.json`;
- fixtures for all three visibility modes;
- explicit degraded, stale, disconnected, unknown, denial, revocation, expiry, and revalidation-failure cases;
- proof that every security-breakthrough event remains individual;
- stable sequence-range traceability;
- identical semantic fixture results for TUI and Desktop consumers;
- no change to PDP, PEP, approval, execution, or proof authority.

## Risks

### Projection service becomes too presentation-specific

Mitigation: contract only semantic category, severity, state, summary, traceability, and required visibility. Layout remains client-owned.

### Contract evolution slows UI iteration

Mitigation: only governance meaning is centralized. Visual treatment, density, responsive design, and interaction remain local.

### Runtime-generated summaries become poor or non-localizable

Mitigation: the first implementation may include stable semantic message keys plus fallback summaries. Localization architecture should not block semantic unification.

### Existing TUI behavior cannot map cleanly

Mitigation: preserve the command-spine view as a renderer. Adapt its mapper incrementally against fixtures rather than replacing the shell.

## Rollback

This ADR introduces no production behavior by itself. It can be reverted by deleting the document before implementation.

After implementation begins, rollback means:

1. keep the raw event contract and transport unchanged;
2. disable the shared projection path behind a compatibility switch;
3. return clients to their prior mapper versions;
4. preserve projection fixtures and version history for diagnosis.

Rollback must never suppress security-breakthrough events or reinterpret degraded evidence as healthy.

## Consequences

### Positive

- TUI and Desktop communicate the same governance truth without sharing visual components.
- Security-critical visibility becomes testable across clients.
- New clients do not need to reimplement event semantics.
- Design-system work can focus on visual expression over a stable semantic layer.
- Forensic traceability remains available from every aggregate.

### Negative

- A new versioned contract and fixture suite must be maintained.
- Existing TUI projection code will need incremental adaptation.
- Desktop code generation gains another artifact dependency.

## Follow-up implementation plan

This ADR intentionally does not change production code. The next implementation PR should be limited to:

- `contracts/governance-projection.v1.json`;
- deterministic projection fixtures;
- schema validation tests;
- no TUI or Desktop migration in the same PR.

That keeps the semantic contract reviewable before either client is modified.
