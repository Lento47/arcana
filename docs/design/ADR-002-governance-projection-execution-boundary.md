# ADR-002: Governance Projection Execution Boundary

- **Status:** Proposed
- **Date:** 2026-08-03
- **Decision owners:** Arcana runtime, TUI, Desktop, and contract architecture
- **Scope:** Execution and transport boundary for governance projections; no authority or production behavior change
- **Depends on:** `ADR-001-shared-governance-projection-contract.md`

## Context

ADR-001 establishes that Arcana needs one versioned, surface-neutral governance projection contract so the TUI, Desktop, and future clients communicate the same governance meaning.

It intentionally leaves one implementation-critical question unresolved: **where the canonical projector executes and how clients obtain projected items**.

That question must be answered before adding `contracts/governance-projection.v1.json` or migrating either client. Otherwise, the same schema can lead to incompatible implementations:

- the TUI may call an in-process projector while Desktop independently reimplements it;
- Desktop may derive projections from cached raw events while the runtime uses newer grouping rules;
- a server endpoint may return presentation-ready strings that couple authority code to localization and layout;
- visibility-mode switching may require network round trips or produce different results offline;
- raw-event recovery and projected-item recovery may develop separate sequence semantics.

This is an architectural boundary, not a rendering preference. Projection severity, state, breakthrough visibility, stale/degraded status, and source-sequence traceability influence operator decisions and therefore must not drift by client.

## Decision

Arcana will use a **runtime-owned pure projector with a versioned projection API**, while preserving the raw authoritative event stream as the canonical recovery and forensic source.

The runtime is the only component that defines and executes canonical event-to-projection semantics. The TUI may invoke the same pure projector in process because it lives in the runtime repository. Desktop and external clients obtain canonical projected items through the runtime API rather than reimplementing grouping, severity, state, stale/degraded, or breakthrough rules.

The projection API is additive. It does not replace the raw event stream.

### Required boundary

The architecture has two parallel read paths with different responsibilities:

1. **Raw authoritative events**
   - durable identity and monotonic sequence;
   - restart, gap recovery, deduplication, forensic inspection, and proof traceability;
   - transported through the existing event stream and replay endpoints;
   - never rewritten by the projection layer.

2. **Canonical governance projections**
   - deterministic semantic grouping for a requested visibility mode;
   - severity, state, stale/degraded, breakthrough, and source-sequence range;
   - computed by the runtime-owned pure projector;
   - exposed through a versioned, read-only API;
   - never used to authorize, claim, consume, or execute an effect.

### Proposed API shape

The exact OpenAPI shape remains a follow-up contract decision, but the first implementation should support a bounded request such as:

```http
GET /projections/governance?mode=operations&afterSequence=120&limit=200
```

A response must identify:

- projection contract version;
- runtime protocol revision;
- requested visibility mode;
- inclusive source sequence range covered;
- whether the result is complete, stale, degraded, or requires raw-event resync;
- ordered `GovernanceProjectionItem` values defined by ADR-001;
- the next source sequence needed for continuation.

The endpoint must be a deterministic function of ordered canonical events, projection version, mode, and explicit bounded request parameters. It must not depend on client identity, local UI state, viewport size, color theme, notification preferences, or hidden server session state.

### Streaming behavior

The existing raw SSE event stream remains the live invalidation and recovery mechanism for the first implementation.

Clients use a new event sequence to determine that their materialized projection view is stale, then request the affected projection range. The first projection implementation must not introduce a second independently sequenced projection stream.

A dedicated projection stream may be considered later only if measurement proves that range refresh is insufficient. It would require a separate ADR because it introduces additional ordering, replay, deduplication, and compatibility semantics.

### TUI behavior

The TUI may call the runtime projector directly in process, provided that:

- it uses the same exported projector entrypoint used by the projection API;
- API and in-process results are verified against the same deterministic fixtures;
- the command-spine remains a renderer and does not preserve a competing semantic mapper;
- mode, sequence range, and projection version are explicit inputs.

No TUI-only severity, state, grouping, or breakthrough classification may exist after migration.

### Desktop behavior

Desktop consumes the projection API for canonical semantic items and retains raw events for:

- sequence-gap detection;
- restart recovery;
- forensic detail;
- proof and source-event inspection;
- determining when its cached projection range needs refresh.

Desktop may cache projected items for display while offline, but cached items must be marked stale and authority commands remain disabled according to the binding offline rules.

Desktop owns rendering, navigation, density, typography, accessibility, notifications, and localization. It does not own governance classification.

### Copy and localization boundary

The canonical projection must not make free-form English text the semantic contract.

Each item should carry:

- a stable semantic `messageKey`;
- typed, bounded `messageArgs` derived from canonical event fields;
- an optional runtime-generated fallback summary for diagnostics and unsupported clients.

Clients may localize and format `messageKey` plus `messageArgs`. They may not change severity, state, breakthrough status, or factual argument values. Unknown message keys must render the fallback summary and an observable compatibility warning, never a fabricated healthy label.

## Why this decision

The decision keeps governance semantics centralized without moving pixels, interaction, or localization into the authority runtime.

It also preserves one durable recovery source. Raw events remain the audit truth; projections remain deterministic read models derived from that truth.

The API boundary lets Desktop and future non-TypeScript clients consume canonical meaning without requiring a shared UI framework or language-specific semantic implementation.

## Alternatives considered

### A. Every client implements the projection schema independently

**Rejected.** A shared output schema does not guarantee shared classification. Separate implementations can still disagree about grouping boundaries, severity, stale state, breakthrough handling, or enum transitions. Cross-client fixtures reduce but do not eliminate operational drift.

**Migration cost:** lowest initially, highest over time.

**Compatibility risk:** high whenever projection rules evolve.

### B. Publish a shared TypeScript projection library for all clients

**Rejected as the primary boundary.** It works for the TUI and SolidJS frontend but not for the Rust host, SDKs in other languages, or future independent clients. Shipping identical code also does not solve version negotiation with a running daemon.

A generated client or optional language binding may wrap the API, but it is not the source of authority.

### C. Send projected items directly on the existing SSE stream

**Rejected for the first implementation.** Mixing raw and projected records complicates sequence ownership, replay, deduplication, and compatibility. It risks treating a derived view as a second authoritative log.

### D. Replace raw events with projected items

**Rejected.** Projection aggregation cannot replace forensic evidence, exact replay, proof traceability, or future re-projection under a new projection version.

### E. Runtime returns fully rendered strings

**Rejected.** It would couple the runtime to English copy, truncation, terminal width, desktop layout, accessibility, and localization. Free-form strings are not a stable semantic contract.

## Compatibility

This decision is additive and does not change current endpoints or event payloads.

The projection contract version is independent from the raw event catalog version. A client must advertise or request a supported projection version. An unsupported projection version must produce an explicit compatibility error or safe forensic fallback; it must not silently reinterpret unknown output.

Raw event compatibility remains governed by `contracts/events.v1.json` and the existing protocol revision. A projection API change is breaking when an existing conforming client can no longer:

- request a supported visibility mode;
- decode required projection fields;
- preserve source sequence traceability;
- distinguish stale, degraded, unknown, denied, revoked, or failed states;
- preserve breakthrough visibility.

## Migration plan

### Stage 1: Contract and fixtures

- add `contracts/governance-projection.v1.json`;
- define request/response schemas in `approval-api.v1.yaml` or its successor runtime API contract;
- add fixtures covering all governance events and all three modes;
- include message keys, typed arguments, fallback summaries, sequence ranges, and compatibility errors;
- add contract syntax and required-field guards.

No client migration occurs in this stage.

### Stage 2: Pure runtime projector

- implement one side-effect-free projector entrypoint;
- make event order, projection version, mode, and bounds explicit inputs;
- prohibit database, clock, network, theme, locale, and viewport dependencies;
- validate deterministic output against fixtures;
- test breakthrough preservation and false-health prevention.

### Stage 3: Read-only projection API

- expose the pure projector through a bounded read endpoint;
- add pagination/range, stale, incomplete, and resync behavior;
- add protocol/version negotiation and negative tests;
- prove that projection reads cannot mutate governance state or authorize effects.

### Stage 4: TUI migration

- replace client-specific semantic mapping with the shared projector output;
- preserve the command-spine visual system;
- retain renderer-specific grouping only when it does not alter semantic item boundaries or required breakthrough visibility;
- remove superseded semantic mapping after fixture parity.

### Stage 5: Desktop migration

- generate or update the Desktop client from the runtime contract;
- materialize projected items from the API;
- use raw event sequence changes as invalidation and recovery signals;
- implement stale/offline display and safe compatibility fallback;
- verify identical semantic fixtures across TUI and Desktop.

## Validation requirements

Before this ADR moves to Accepted, implementation evidence must include:

- one exported runtime projector used by both the TUI path and projection API;
- byte-stable or structurally identical fixture output for equal inputs;
- all event types and visibility modes covered;
- individual output for every security-breakthrough event;
- exact inclusive source sequence ranges;
- no false healthy state for stale, degraded, missing, disconnected, unknown, denied, revoked, expired, or failed evidence;
- projection API restart, pagination, gap, and version-mismatch tests;
- proof that raw event recovery remains sufficient and no second sequence authority was introduced;
- Desktop unsupported-key fallback and stale-cache behavior;
- no changes to PDP, PEP, approval, capability, execution, or proof authority.

## Migration cost

Expected cost is moderate:

- new projection schema and OpenAPI endpoint;
- pure runtime projector and fixtures;
- incremental replacement of the existing TUI semantic mapper;
- Desktop API consumption and cache invalidation;
- message-key catalogs for supported locales.

This cost is higher than duplicating a mapper once, but lower than maintaining multiple governance interpretations across every future surface.

## Risks and mitigations

### Runtime becomes a presentation service

Mitigation: the runtime owns semantic read models only. Layout, typography, localization, interaction, animation, and accessibility remain client-owned.

### Projection API increases local latency

Mitigation: bounded range requests, local caching, and raw-event invalidation. The TUI uses the same projector in process. Measure before introducing a projection stream.

### Projection and raw event views temporarily disagree during migration

Mitigation: fixtures, sequence-range traceability, version fields, and a staged migration. Clients may fall back to raw forensic rendering when compatibility is uncertain.

### Message-key catalogs drift from runtime arguments

Mitigation: message keys and argument schemas are contract fields, generated into clients, and covered by fixture tests. Unknown keys use the fallback summary with an explicit warning.

### Server-side projection becomes a bottleneck

Mitigation: the projector is pure and range-bounded, allowing memoization by projection version, mode, and source sequence range without changing semantics.

## Rollback

Before production implementation, rollback is deletion of this ADR.

After implementation begins:

1. keep raw events and replay endpoints unchanged;
2. disable the projection endpoint behind a compatibility flag;
3. return the TUI and Desktop to their previous mappers only for supported raw event versions;
4. force forensic/raw-event rendering when semantic compatibility is uncertain;
5. preserve projection schemas, fixtures, and version history for diagnosis.

Rollback must not suppress security-breakthrough events, enable authority commands from stale Desktop state, or reinterpret degraded/unknown states as healthy.

## Consequences

### Positive

- one executable source of governance semantics;
- no language-specific reimplementation required for Desktop or future SDKs;
- raw forensic truth remains independent and recoverable;
- visibility modes and breakthrough behavior become centrally testable;
- localization becomes possible without making English strings authoritative;
- TUI and Desktop remain visually independent over identical semantic items.

### Negative

- the runtime gains a read-only derived-view endpoint;
- Desktop needs both raw-event recovery and projection-range materialization;
- migration requires temporary coexistence with existing client mappers;
- projection versioning and message-key catalogs become maintained contract surfaces.

## Follow-up scope

The next PR should remain contract-only:

- add `contracts/governance-projection.v1.json`;
- add the projection read endpoint and error schemas to the OpenAPI artifact;
- add deterministic examples/fixtures;
- extend contract guards;
- do not implement the projector or modify TUI/Desktop production code in the same PR.
