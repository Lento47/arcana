# Arcana Runtime — Desktop & Operator API Contract

**Document class:** runtime/Desktop API contract (Phase D, pre-release)
**Authority:** this file + `contracts/approval-api.v1.yaml` (machine-readable OpenAPI)
**Updated:** 2026-08-03 (approval routing, surface binding, revoke, TUI projection)

The runtime owns all authority. Arcana Desktop, the CLI, and the TUI render
projections and submit operator commands; none of them ever own authority.
The sidecar and Desktop must never own authority.

## Authoritative flow

```
CLI/TUI agent session
  -> canonical AuthorizationRequest
  -> PDP
  -> REQUIRE_APPROVAL
  -> durable PENDING approval
  -> approval event (SSE /event)
  -> Desktop or local TUI operator surface
  -> runtime receives approve/deny/revoke command
  -> exact-request revalidation
  -> PEP execution or denial
  -> receipt + evidence + RunProof
```

Approval does not directly execute an effect. After a decision the PEP
revalidates with a fresh context and executes at most once (or zero times on
denial/revocation/expiry/staleness).

## Mounted runtime endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/approvals` | Durable approval records for the routed workspace |
| GET | `/approvals/:approvalId` | One approval record |
| GET | `/approvals/:approvalId/affordances` | Runtime-derived authority affordances for the authenticated surface |
| POST | `/approvals/:approvalId/approve` | Approve after exact-request revalidation |
| POST | `/approvals/:approvalId/deny` | Deny; parked call fails closed with zero effects |
| POST | `/approvals/:approvalId/revoke` | Invalidate PENDING/APPROVED; zero effects can ever claim |
| GET | `/event` | SSE event stream (approval.updated and all EventV2 events) |
| GET | `/health` | Runtime health |
| GET | `/sessions` | Sessions in the routed workspace |
| GET | `/sessions/:sessionId` | One session record |
| GET | `/proofs/:sessionId` | RunProof snapshot (hash, trace health, integrity, authorization profile) |
| POST | `/desktop/heartbeat` | Advisory Desktop liveness announcement (expiring) |

The session-scoped TUI/CLI surface remains:
`POST /api/session/:sessionID/approval/:approvalID/command` — it drives the
same runtime service (`submitApprovalCommand`) with `surface: "LOCAL_TUI"`.

The machine-readable OpenAPI file is `contracts/approval-api.v1.yaml`.

## Approval decision body (exact-request revalidation)

All decision endpoints require:

```json
{
  "expectedVersion": 1,
  "expectedRequestHash": "sha256-of-canonical-request",
  "expectedContractRevision": 1
}
```

Responses are a 200 union: `{ success: true, approval }` or
`{ success: false, reason, stale? }`. Stale version/hash/revision is
machine-readable (`stale: true`).

The runtime revalidates before and at execution:

- exact request hash (canonical, immutable)
- request identity and nonce (bound into the canonical request)
- approval status and expiry
- capability status and use count
- current intent and contract revision
- policy compatibility (fresh PDP snapshot at execution)
- workspace trust
- revocation state (revoked/INVALIDATED approvals cannot claim)
- single-use claim (atomic `APPROVED -> CLAIMED`, consume at most once)

## Operator identity

Approval commands never trust a client-supplied `approvedBy`,
`actorUserId`, `operatorId`, or equivalent authority field. The operator is
derived from the authenticated server context:

- Basic-auth username when server auth is required;
- the trusted local runtime context (`local-operator`) when auth is not
  required.

An optional `x-arcana-session` header acts only as a restriction: a caller
acting for session A cannot decide session B's approval.

## Approval routing model

Routing is advisory for presentation and decision-surface selection. It never
authorizes an action, extends expiry, fabricates identity, consumes an
approval, changes a PDP result, or executes an effect.

`type ApprovalRoute = "LOCAL_TUI" | "DESKTOP_PREFERRED" | "DESKTOP_REQUIRED" | "CENTRAL_REQUIRED"`

- `LOCAL_TUI` — the TUI may display and decide locally.
- `DESKTOP_PREFERRED` — Desktop when a live subscriber exists; TUI fallback
  only when policy explicitly permits it.
- `DESKTOP_REQUIRED` — remains PENDING while Desktop is unavailable; no silent
  local fallback.
- `CENTRAL_REQUIRED` — local TUI and Desktop may inspect but cannot decide;
  Arcana Control owns the decision.

Policies are loaded from `<workspace>/.arcana/approval-routing.json` (strict
schema; invalid files fail closed to the deployment default) or the
deployment default (`ARCANA_DEPLOYMENT_MODE` = `LOCAL` | `HYBRID` |
`ENTERPRISE`). Rules match by workspace, action, capability, risk class, and
deployment mode; the first matching rule wins.

Routing metadata (`route`, `routingPolicyVersion`, `localFallbackAllowed`,
`riskClass`) is persisted on the durable approval record and surfaced in the
API and `approval.updated` events.

## Durable approval state machine

```
PENDING -> APPROVED -> CLAIMED -> CONSUMED
PENDING -> DENIED
PENDING -> INVALIDATED   (REVOKE)
APPROVED -> INVALIDATED  (REVOKE, before claim)
PENDING/APPROVED -> EXPIRED
CLAIMED -> CONSUMED      (single use; duplicate consume refused)
```

`REVOKE` is allowed only for PENDING or APPROVED (claimed approvals are
execution-bound). Revoked approvals can never claim, so zero effects execute.
Duplicate approve/deny/revoke commands are refused deterministically
(`ALREADY_DECIDED` / not actionable); duplicate consume is refused.

## Desktop subscriber awareness

`POST /desktop/heartbeat` registers an expiring subscriber (default TTL
30 s). A dead or stale subscriber automatically becomes unavailable; the
registry prunes on read. This state is advisory only: it may influence
routing but never authorizes, extends expiry, fabricates identity, consumes
an approval, changes a PDP result, or executes an effect. Desktop disconnect
never loses the durable approval.

## TUI/CLI governance projection

The TUI renders three visibility modes (`f` cycles):

- **conversation** (default) — user/assistant communication, concise analysis
  summaries, compact tool receipts, approval waits, final proof summary.
  Healthy governance events never render as raw rows; they appear as compact
  lifecycle groups (e.g. `✓ governed · 6 authorized · 6 executed · 0 denied`).
- **operations** — grouped tool executions, grouped governance lifecycle,
  capabilities, timing, approval transitions.
- **forensic** — canonical requests, request hashes, policy versions, event
  sequences, raw governance payloads, complete RunProof evidence; governance
  groups are expanded by default.

Security-critical states always break through filtering: approval required,
denial, capability revocation, request mutation after approval, runtime
disconnection, degraded or missing evidence, unknown execution state after
crash, revalidation failure.

Examples:

```text
✓ inspected 6 files
✓ governed write · authorized · executed · 184ms
◷ waiting for approval · modify deployment/config.yaml
✓ approved by operator · execution resumed
× denied by operator · no protected effect executed
! proof P1 · 5 authorized · 1 approved · 0 unauthorized
```

Raw evidence is never deleted or weakened; only the default projection
changes.

## Nonclaims

- Desktop itself is specification-only in this repository; this contract is
  the runtime surface Desktop will consume.
- `CENTRAL_REQUIRED` approvals wait for Arcana Control; there is no local
  decision path.
- The contract is pre-release; `contracts/approval-api.v1.yaml` records the
  correction and status explicitly.
