---
document_class: evidence
status: review_required
reviewed_branch: phase-d-implementation
reviewed_commit: 3963d806378dae1d3955849ae0cf21bbb14c6c20
review_date: 2026-08-02
---

# Runtime and approval contract code review

This review records concrete correctness and security findings from the current Runtime/Desktop approval implementation. It is intentionally separate from the roadmap and status authorities.

## Severity summary

| ID | Severity | Finding | Release impact |
|---|---|---|---|
| ARC-REV-001 | P0 | Binding OpenAPI and mounted approval command disagree | Generated Desktop client cannot safely interoperate |
| ARC-REV-002 | P0 | Approval lifecycle mutation and outbox write are not atomic | State can commit without its authoritative event |
| ARC-REV-003 | P1 | Lower-level `APPROVE` processing can create a missing record | Unsafe invariant if the lifecycle processor is called without the operator-service guard |
| ARC-REV-004 | P1 | Outbox event IDs use wall-clock time and randomness inside lifecycle logic | Replay and deterministic evidence are weakened |
| ARC-REV-005 | P1 | Runtime API workspace/operator scoping is broader than its documentation | Cross-workspace reads or decisions may be possible under shared runtime exposure |
| ARC-REV-006 | P1 | Runtime session listing is not filtered by routed workspace | Endpoint description and behavior disagree |

## ARC-REV-001 — Contract and runtime payload mismatch

### Evidence

`contracts/approval-api.v1.yaml` defines `DecisionBody` with only an optional `note`. The mounted schema in `packages/engine/src/server/routes/instance/httpapi/groups/runtime.ts` requires:

- `expectedVersion`
- `expectedRequestHash`
- `expectedContractRevision`

The contract documents `403` and `409` responses, while the mounted endpoint exposes a `200` success/failure union and only `BadRequest` as a transport error.

### Risk

A Desktop client generated from the binding artifact cannot call the mounted implementation correctly. Removing the expected fields would also be unsafe unless they are replaced by a contract-level stale-view mechanism.

### Required fix

Update the contract and runtime together. Preserve exact-request and optimistic-concurrency protection using explicit expected fields or `If-Match`/ETag. Add conformance tests and bump protocol revision for breaking changes.

## ARC-REV-002 — Lifecycle and outbox are not atomic

### Evidence

`ApprovalLifecycleStore` exposes separate `saveApproval`, `saveExecution`, and `appendOutboxEvent` calls. `SqliteApprovalStore` executes each as an independent statement. Approval handlers call them sequentially even though comments describe a transactional outbox.

### Risk

A crash or SQLite error after the state update but before the outbox insert leaves durable approval state without the authoritative event. Claim and consume transitions can also split approval, execution, and event state.

### Required fix

Introduce a single transactional transition operation that commits the approval record, optional execution record, and outbox event in one SQLite transaction. Add injected-failure and restart tests at every statement boundary.

## ARC-REV-003 — Lower-level approve can fabricate a missing record

### Evidence

`handleApprove` creates a new `PENDING` record when `loadApproval()` returns `null`, then immediately transitions it to `APPROVED`.

The currently mounted path has an upstream guard: `RealApprovalOperatorService.submitCommand()` loads the approval and returns `approval not found` before calling `processApprovalCommand`. Therefore this is not presently demonstrated as a mounted API bypass.

### Risk

The lower-level lifecycle processor does not enforce the invariant that approval creation and approval decision are separate operations. A future or alternate call site that invokes `processApprovalCommand` directly could create the durable object it is supposed to decide, weakening provenance of the original authorization request.

### Required fix

Make the invariant local to the lifecycle boundary: return `approval not found` when the record does not exist. Approval creation must occur only in the PDP/approval-required path with the canonical request already persisted. Add direct lifecycle and mounted-service regression tests proving an unknown approval ID cannot create any record or event.

## ARC-REV-004 — Nondeterministic event identity

### Evidence

Lifecycle events use IDs constructed from `Date.now()` and `Math.random()`.

### Risk

The pure lifecycle processor becomes nondeterministic, event identity cannot be reproduced from the transition, and collision/idempotency behavior is not specified.

### Required fix

Generate event identity from a durable transition identity such as approval ID, resulting version, transition kind, and a persisted command/transition ID. Event insertion should be idempotent under retry.

## ARC-REV-005 — Workspace and operator scope

### Evidence

The runtime handler accepts a query-supplied directory when no routing context exists. Operator identity is derived as a Basic-auth username or `local-operator`, then receives wildcard workspace scope. Approval stores are selected from the resolved directory.

### Risk

If the API is exposed beyond a strictly single-user loopback process, one authenticated operator can select another directory and obtain wildcard decision scope. The documented workspace boundary is therefore dependent on deployment assumptions rather than explicit authorization.

### Required fix

Bind workspace identity to authenticated server context or a validated workspace registry. Treat a query directory only as a narrowing selector, never a grant. Replace wildcard scope with the resolved authorized workspace set. Add cross-workspace denial tests.

## ARC-REV-006 — Session listing ignores routed workspace

### Evidence

`listSessions` calls `session.list()` without applying the resolved workspace directory, despite the endpoint description promising sessions for the routed workspace.

### Risk

Desktop can receive sessions outside the selected workspace and then attempt follow-up reads against them.

### Required fix

Filter sessions by the authorized routed workspace and test multi-workspace isolation for list/get/proof operations.

## Positive finding already addressed

Approval routing previously used Desktop liveness without binding the submitting surface. PR #30 added explicit `LOCAL_TUI`, `DESKTOP`, and `CENTRAL` decision surfaces. PR #31 merged regression tests for that boundary.

## Recommended PR sequence

1. Contract parity and protocol revision.
2. Existing-record-only lifecycle invariant.
3. Atomic lifecycle transaction and deterministic event identity.
4. Workspace/operator/session isolation.
5. End-to-end Desktop generated-client conformance test.

Do not combine these into one mega-PR. Each change affects a different security invariant and should remain independently reviewable.
