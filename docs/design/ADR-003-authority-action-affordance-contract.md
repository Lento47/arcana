# ADR-003: Authority Action Affordance Contract

- **Status:** Proposed
- **Date:** 2026-08-03
- **Decision owners:** Arcana runtime, TUI, Desktop, Control, and design-system architecture
- **Scope:** Operator-facing action availability and feedback for approval, denial, revocation, inspection, and recovery; no authority or execution behavior change
- **Depends on:** `contract-first-architecture.md`, `ADR-001-shared-governance-projection-contract.md`, `ADR-002-governance-projection-execution-boundary.md`, `../RUNTIME-API-CONTRACT.md`

## Context

Arcana has converged on a strong authority boundary:

- the runtime owns approval state, routing, revalidation, claim, consumption, revocation, and execution;
- TUI, Desktop, and future Control surfaces are presentation clients that submit bounded commands;
- operator identity is derived from authenticated runtime context, never from client payloads;
- approval routing determines which surface may decide;
- offline or stale clients must not queue authority decisions;
- shared governance projections will provide consistent semantic state across surfaces.

One high-impact design-system boundary is still implicit: **how a client decides whether an authority action is available, disabled, hidden, pending, stale, or completed, and how it communicates the reason**.

Without a shared contract, each surface can remain technically correct at the API boundary while still presenting materially different or unsafe operator experiences:

- the TUI can show an active Approve key while Desktop correctly treats the same approval as inspect-only;
- a Desktop button can remain enabled after its cached record becomes stale;
- one surface can hide a routed approval while another shows it as unavailable;
- optimistic UI can display “approved” before the runtime commits the transition;
- a generic disabled state can conceal whether the cause is offline, stale data, route ownership, expiry, prior decision, protocol mismatch, or insufficient authority;
- duplicate commands can look like success even when the runtime refused them;
- notification actions can become an accidental authority path that bypasses the full decision context.

This is not merely visual consistency. Authority affordances influence what an operator believes is possible and what has already happened. A surface must never imply that an action is currently valid, accepted, or complete when the runtime has not established that fact.

ADR-001 and ADR-002 centralize governance meaning, but they do not define command affordances. Projection state describes what happened; command affordance describes what the current authenticated surface may attempt now.

## Decision

Arcana will define one **runtime-derived authority action affordance contract** shared by TUI, Desktop, Control, SDK consumers, and future operator surfaces.

Clients may choose different controls, shortcuts, layout, density, animation, confirmation patterns, and accessibility treatments. They may not independently infer whether an authority action is actionable or why it is unavailable.

The runtime will derive affordances from authoritative state and authenticated request context. Clients render those affordances and submit only the corresponding bounded commands.

The contract is a read model. It grants no authority by itself and does not replace command-time validation. Every submitted command is still revalidated atomically by the runtime.

## Required model

For each approval or authority-bearing record, the runtime should expose an affordance set such as:

```ts
type AuthorityAction =
  | "inspect"
  | "approve"
  | "deny"
  | "revoke"
  | "retry_refresh"
  | "open_forensic"

type AuthorityAffordance = {
  action: AuthorityAction
  state: "available" | "unavailable" | "in_flight" | "completed"
  reasonCode?: AuthorityAffordanceReason
  expectedVersion?: number
  expectedRequestHash?: string
  expectedContractRevision?: number
  surface: "LOCAL_TUI" | "DESKTOP" | "CONTROL" | "SDK"
  requiresFreshRecord: boolean
  destructive: boolean
}

type AuthorityAffordanceReason =
  | "OFFLINE"
  | "STALE_RECORD"
  | "RESYNC_REQUIRED"
  | "PROTOCOL_MISMATCH"
  | "ROUTE_LOCAL_TUI_ONLY"
  | "ROUTE_DESKTOP_REQUIRED"
  | "ROUTE_CENTRAL_REQUIRED"
  | "LOCAL_FALLBACK_NOT_ALLOWED"
  | "SURFACE_NOT_AUTHORIZED"
  | "SESSION_RESTRICTION"
  | "WORKSPACE_MISMATCH"
  | "AUTHENTICATION_REQUIRED"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_REVOKED"
  | "ALREADY_DECIDED"
  | "ALREADY_CLAIMED"
  | "ALREADY_CONSUMED"
  | "REQUEST_CHANGED"
  | "CONTRACT_REVISION_CHANGED"
  | "CAPABILITY_REVOKED"
  | "POLICY_CHANGED"
  | "EVIDENCE_DEGRADED"
  | "UNKNOWN_RUNTIME_STATE"
```

Names may be refined in the machine-readable contract, but the implementation must preserve these responsibilities:

- explicit action identity;
- explicit availability state;
- machine-readable unavailability reason;
- the authenticated decision surface;
- freshness requirements;
- exact-request precondition fields where applicable;
- destructive/non-destructive classification.

## Core invariants

### 1. Availability is runtime-derived

A client may not infer actionability solely from approval status, route text, cached timestamps, or local UI state. The runtime derives affordances using:

- current durable approval state;
- authenticated principal and surface;
- workspace and optional session restriction;
- persisted routing decision and fallback policy;
- current runtime connectivity and protocol compatibility;
- record freshness and resync state;
- expiry, revocation, claim, and consumption state;
- exact-request version, hash, and contract revision;
- capability and policy compatibility where known.

### 2. An enabled control is not an authorization result

`available` means the authenticated client may submit the bounded command for runtime evaluation. It does not mean the command will succeed or that an effect is authorized.

The runtime must still perform command-time and execution-time revalidation.

### 3. No optimistic authority completion

Clients may show an action as `in_flight` after submission. They may not render `completed`, “approved,” “denied,” “revoked,” “executed,” or equivalent authoritative success until the runtime response or subsequent durable event confirms the committed transition.

A transport acknowledgement is not a governance transition.

### 4. Stale or disconnected means no authority actions

When the client is offline, protocol-incompatible, gap-detected, resyncing, or displaying a stale approval record:

- approve, deny, and revoke are unavailable;
- authority commands are not queued locally;
- cached records remain inspectable and are visibly stale;
- refresh, reconnect, or forensic inspection may remain available.

### 5. Routed inspect-only state is explicit

For `CENTRAL_REQUIRED`, local TUI and Desktop show the approval and its route, but approve, deny, and revoke are unavailable with `ROUTE_CENTRAL_REQUIRED`.

For `DESKTOP_REQUIRED`, TUI does not silently hide the approval or imply local actionability. It may show an inspect-only wait state with `ROUTE_DESKTOP_REQUIRED`.

For `DESKTOP_PREFERRED`, TUI fallback is available only when the persisted policy explicitly permits it and current runtime state confirms the fallback condition.

### 6. Hidden is not an authority state

The semantic contract does not include `hidden` as an affordance state. A client may omit non-relevant controls from a compact layout, but required governance state and the reason an expected action is unavailable must remain discoverable through inspection or expanded detail.

A routed or blocked approval cannot disappear in a way that looks like no approval exists.

### 7. Reason codes are stable; copy is client-owned

The runtime returns stable reason codes and typed facts. Clients own localized copy, layout, icons, keyboard labels, help text, and accessibility descriptions.

Unknown reason codes render a safe generic unavailable state plus an observable compatibility warning. They never fall back to an enabled control.

### 8. Duplicate or raced commands are not success

If another surface or operator commits a transition first, the losing client must refresh and render the durable state. `ALREADY_DECIDED`, stale version, changed request hash, or changed contract revision must not be translated into success.

### 9. Notifications cannot be a privileged shortcut

Notifications may announce that an approval requires attention and may open the full approval detail. They do not contain one-click approve, deny, or revoke actions unless a future ADR defines an equivalent authenticated, context-complete, command-time-revalidated flow.

The current release keeps notification actions non-authoritative.

### 10. Destructive actions require distinguishable treatment

Revoke and deny must be semantically distinguishable from approve and inspect. The shared contract marks destructive actions, while each client decides the appropriate confirmation and interaction pattern for its platform.

The design system must never rely on color alone to distinguish these actions.

## Surface responsibilities

### Runtime owns

- affordance derivation;
- action identifiers and stable reason codes;
- surface and principal binding;
- freshness and compatibility eligibility;
- route and fallback eligibility;
- exact-request precondition values;
- authoritative command results;
- durable transition events.

### TUI, Desktop, and Control own

- control type and placement;
- keyboard shortcuts and focus behavior;
- confirmation interaction;
- typography, iconography, spacing, motion, and responsive layout;
- localized reason copy;
- accessibility labels and non-color cues;
- compact versus expanded presentation;
- local in-flight indication that never claims committed success.

### Clients must not own

- route interpretation;
- stale-record eligibility rules;
- approval transition legality;
- exact-request revalidation;
- principal or operator identity;
- fallback authorization;
- success inference from HTTP transport alone.

## Proposed API integration

The smallest compatible implementation is additive.

Approval responses may include:

```json
{
  "approval": { "...": "existing durable record" },
  "affordances": [
    {
      "action": "approve",
      "state": "available",
      "surface": "DESKTOP",
      "requiresFreshRecord": true,
      "destructive": false,
      "expectedVersion": 7,
      "expectedRequestHash": "sha256:...",
      "expectedContractRevision": 1
    },
    {
      "action": "revoke",
      "state": "available",
      "surface": "DESKTOP",
      "requiresFreshRecord": true,
      "destructive": true,
      "expectedVersion": 7,
      "expectedRequestHash": "sha256:...",
      "expectedContractRevision": 1
    }
  ]
}
```

List endpoints may return affordances for the authenticated caller, or a bounded summary with full affordances on detail fetch. The exact shape belongs in a follow-up OpenAPI decision.

Affordance responses are principal- and surface-sensitive read models. They must not be stored as durable authority or replayed as if they were approval state.

## Alternatives considered

### A. Let each client infer controls from approval status and route

**Rejected.** Lowest initial implementation cost, but duplicates security-sensitive state-machine and routing interpretation across every surface. It is especially fragile during races, reconnects, protocol upgrades, and future Control integration.

**Migration cost:** low initially, high cumulative maintenance.

**Security risk:** high because an enabled control can misrepresent current eligibility.

### B. Return only a boolean such as `canApprove`

**Rejected.** Booleans do not explain stale, routed, expired, revoked, already-decided, policy-changed, or compatibility states. They also scale poorly as deny, revoke, inspect, refresh, and future actions evolve.

**Compatibility:** poor; every new action adds another field and client-specific fallback.

### C. Depend entirely on command errors

**Rejected as the primary UX contract.** Command-time refusal remains mandatory, but using errors as the only availability signal creates avoidable failed interactions, encourages optimistic controls, and produces inconsistent disabled-state explanations.

### D. Hide controls that are not currently actionable

**Rejected as a semantic rule.** Hiding may be acceptable in compact layout, but it cannot be the only representation. Operators need to understand that an approval exists, which surface owns it, and why the local surface cannot decide.

### E. Share a visual component library

**Rejected as the architectural solution.** TUI, Desktop, and Control have different rendering technologies and interaction models. Shared components cannot reliably encode authenticated runtime context, route eligibility, freshness, or command races.

### F. Put affordance rules inside the governance projection contract

**Rejected.** Projection semantics are deterministic from canonical events and visibility mode. Action affordances additionally depend on authenticated principal, surface, current connectivity, freshness, and protocol state. Combining them would make projections identity-dependent and weaken their deterministic replay properties.

## Compatibility

This decision is additive. Existing approval records, event schemas, commands, and state transitions remain unchanged.

The affordance contract should be versioned within the runtime API contract. Additive actions or optional reason metadata may be compatible. The following require a contract revision or explicit capability negotiation:

- changing the meaning of an existing action or reason code;
- changing a previously unavailable state to available for an existing route;
- removing a required freshness check;
- changing how a surface is authenticated or bound;
- allowing notifications or offline clients to submit authority commands;
- changing destructive classification in a way that alters required client treatment.

Older clients that do not understand affordances may continue using current command endpoints, but the runtime remains fail-closed. New clients must not introduce fresh client-side eligibility logic while the migration is underway.

## Migration plan

### Stage 1: Contract and fixtures

- add affordance schemas and reason-code enum to `contracts/approval-api.v1.yaml`;
- define authenticated surface input and response behavior;
- add fixtures for each route, approval state, stale/offline condition, session restriction, workspace mismatch, protocol mismatch, and raced transition;
- add contract guards for required fields and safe unknown-code behavior.

No client UI changes occur in this stage.

### Stage 2: Pure runtime derivation

- implement one side-effect-free `deriveAuthorityAffordances` function;
- make approval record, authenticated principal, surface, workspace/session restrictions, connectivity/freshness, and protocol compatibility explicit inputs;
- prohibit database writes, clocks without explicit input, and client display preferences;
- verify that derivation cannot mutate or authorize.

### Stage 3: Runtime API integration

- include affordances in approval detail responses;
- optionally include bounded affordance summaries in list responses;
- preserve existing command endpoints and command-time validation;
- add race, stale, reconnect, and unsupported-client tests.

### Stage 4: TUI migration

- drive gate actions and keyboard availability from runtime affordances;
- preserve Command Spine layout and current gate interaction;
- show inspect-only route ownership and machine-readable disabled reasons;
- remove duplicated route/status eligibility logic after parity fixtures pass.

### Stage 5: Desktop migration

- generate affordance types from OpenAPI;
- render the same availability and reason semantics with Desktop-native controls;
- disable actions during disconnect, gap recovery, resync, stale cache, and protocol mismatch;
- keep notifications as navigation only;
- test cross-surface parity for equivalent authenticated contexts.

### Stage 6: Control and SDK adoption

- use the same contract for central approvals and administrative clients;
- preserve distinct authentication and surface binding;
- add conformance fixtures for third-party operator clients.

## Validation requirements

Before this ADR moves to Accepted, implementation evidence must include:

- deterministic affordance fixtures for every approval state and routing mode;
- unavailable approve/deny/revoke during offline, stale, gap, resync, and protocol mismatch states;
- inspect-only behavior for `CENTRAL_REQUIRED` and locally ineligible `DESKTOP_REQUIRED` approvals;
- explicit fallback tests for `DESKTOP_PREFERRED` with and without policy permission;
- session and workspace isolation tests;
- race tests where another surface decides first;
- stale version, changed request hash, and changed contract revision tests;
- proof that `available` does not bypass command-time revalidation;
- no optimistic completion before durable transition confirmation;
- unknown reason-code fail-closed rendering tests;
- TUI and Desktop semantic parity fixtures for equivalent contexts;
- accessibility validation that state and destructive intent are not represented by color alone;
- no changes to PDP, PEP, capability, approval transition, claim, consumption, execution, or proof authority.

## Migration cost

Expected cost is moderate and bounded:

- OpenAPI additions and generated client changes;
- one pure runtime derivation function;
- approval response integration;
- incremental replacement of duplicated TUI eligibility logic;
- Desktop adoption when implementation begins;
- fixture coverage across route, connectivity, and race conditions.

The cost is lower than maintaining separate actionability rules in every operator surface and lower than diagnosing authority UX drift after Desktop and Control are live.

## Risks and mitigations

### Affordance read model becomes mistaken for authorization

Mitigation: name and document it as advisory presentation state; retain mandatory command-time and execution-time revalidation; prohibit any execution path from consuming affordance output as proof of authority.

### Principal-sensitive responses complicate caching

Mitigation: mark affordances non-durable and scoped to authenticated principal, surface, workspace, session restriction, and record version. Clients invalidate them on reconnect, principal change, route update, approval event, or protocol change.

### Contract becomes too UI-specific

Mitigation: contract actions, availability, reason codes, freshness, surface, and destructive intent only. Layout, controls, copy, confirmation, motion, density, and accessibility implementation remain client-owned.

### Too many reason codes create maintenance burden

Mitigation: keep codes aligned with stable runtime failure domains, group display copy client-side, and require explicit compatibility behavior for unknown codes.

### Clients show disabled controls everywhere

Mitigation: compact surfaces may omit controls, but expanded inspection must expose action availability and reason. The ADR defines semantics, not permanent visual clutter.

### In-flight state diverges after transport loss

Mitigation: after ambiguous transport failure, return to stale/unknown, disable authority actions, resync from durable state, and never infer committed success.

## Rollback

This ADR changes documentation only and can be reverted before implementation by removing the file.

After implementation begins, rollback is bounded:

1. preserve approval records, commands, routes, and event schemas;
2. stop returning affordance metadata behind a contract capability switch;
3. return supported clients to their prior control logic temporarily;
4. preserve fixtures and reason-code history for diagnosis;
5. retain all runtime command-time validation and fail-closed behavior.

Rollback must never enable offline decisions, weaken route ownership, trust client-supplied identity, treat ambiguous transport as success, or remove exact-request revalidation.

## Consequences

### Positive

- TUI, Desktop, Control, and SDK clients present the same authority-action meaning;
- security-sensitive eligibility logic is removed from UI code;
- routed, stale, offline, raced, and protocol-mismatch states become explainable;
- optimistic authority success is explicitly prohibited;
- future operator surfaces gain a stable design-system boundary without sharing visual components;
- accessibility and localization can evolve independently over stable semantics.

### Negative

- runtime responses become principal- and surface-sensitive read models;
- another versioned contract and fixture set must be maintained;
- existing TUI gate logic will need incremental migration;
- clients must invalidate affordances carefully on events, reconnect, and principal changes.

## Follow-up implementation plan

The next implementation PR should remain contract-only:

- add the affordance schema and reason codes to `contracts/approval-api.v1.yaml`;
- add deterministic JSON fixtures for routes, states, freshness, races, and compatibility;
- add contract syntax and required-field guards;
- do not implement runtime derivation or migrate TUI/Desktop in the same PR.

This preserves reviewability and prevents a semantic contract decision from being bundled with production behavior.