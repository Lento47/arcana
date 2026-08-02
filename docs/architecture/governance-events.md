# Governance Events

Canonical reference for the durable governance event model consumed by the
completion gate, RunProof, the TUI command spine, and the operator surfaces.

## Event store

Governance events are appended to the append-only `EventStore` (hash-chained,
sequence-ordered). The canonical schema is `ArcanaEvent`
(`packages/core/src/epistemic/event.ts`):

```text
ArcanaEvent {
  id, sequence, sessionId?, timestamp, previousHash, hash,
  actor { kind, id },
  type,
  payload (unknown JSON)
}
```

`actor.kind` is one of: `user`, `model`, `tool`, `policy`, `operator`.
`operator` marks explicit human/operator decisions (verification outcomes,
operator revocations) rather than engine-internal policy actions.

## Event families

`packages/engine/src/session/epistemic/governance-event.ts` declares the
canonical families that feed governance projections:

| Family | Examples |
|--------|----------|
| `contract.*` | `contract.proposed`, `contract.activated`, `contract.amended` |
| `claim.*` | `claim.created`, `claim.transitioned` |
| `evidence.*` | `evidence.attached` |
| `obligation.*` | `obligation.created`, `obligation.resolved` |
| `completion.*` | `completion.attempted`, `completion.resolved` |
| `intent.*` | `intent.enforcement_required`, `intent.binding_created`, `intent.binding_revoked`, `intent.compatibility_mode` |
| `authorization.*` | `authorization.requested/allowed/denied/approval_required/stale/executed/execution_failed` |
| `capability.*` | `capability.created`, `capability.revoked`, `capability.exhausted` |
| `verification.*` | `verification.recorded` |

Events outside these families are not promoted to governance truth; the TUI
renders unknown governance events as generic inspect rows without inventing
semantics.

## Obligation verification methods

Proof obligations (`packages/core/src/epistemic/obligation.ts`) carry one of:

| Method | Resolution rule (evidence-gated) |
|--------|----------------------------------|
| `observation` | Satisfied by any durable `evidence.attached` event. |
| `execution` | Satisfied by `authorization.executed` events; test/build/diff/artifact criteria additionally require matching `evidence.attached` receipts (`test_receipt`, `build_receipt`, `diff_receipt`, `artifact_receipt`). |
| `comparison` | Resolved only by a `verification.recorded` event for that obligation. |
| `human_decision` | Resolved only by a `verification.recorded` event (explicit operator decision with a required reason). |
| `external_confirmation` | Resolved only by a `verification.recorded` event (external source confirmation). |

The completion gate (`CompletionVerifier.resolveObligationsFromEvidence`) never
resolves comparison / human_decision / external_confirmation obligations from
executed effects or model prose.

## `verification.recorded` payload

```json
{
  "obligationId": "…",
  "contractId": "…",
  "verification": "comparison | human_decision | external_confirmation",
  "outcome": "satisfied | failed | waived",
  "reason": "required — explicit recorded limitation or decision",
  "details": { }
}
```

Written by `ObligationEngine.recordVerification` (requires a non-empty reason)
and by the operator HTTP endpoint.

## Operator surfaces

| Surface | Action |
|---------|--------|
| HTTP | `POST /session/{sessionID}/obligation/{obligationID}/verify` — body `{ outcome, reason, details? }`; 404 fail-closed for foreign/unknown obligations. |
| SDK | `session.verifyObligation({ sessionID, obligationID, outcome, reason, details? })` |
| CLI | `arcana capability revoke <sessionID> <capabilityID> [--reason …]` |
| TUI / run | `/capability revoke <capabilityID> [reason]` (engine-direct operator action, no model involved) |

## Migration notes

- Event type and actor-kind additions (e.g. `verification.recorded`,
  `actor.kind = "operator"`) are additive literal members of the `ArcanaEvent`
  schema. No database migration is required: `EventStore` persists `payload`
  as JSON and the event hash covers the full payload.
- Obligation statuses already include `satisfied`, `failed`, and `waived`;
  `ObligationTable` needs no schema change for operator verification.
- Contract re-admission is revision-based: each new objective after a resolved
  contract proposes a fresh contract with `revision = max(previous) + 1`
  (lineage is durable and ordered per session).
- Old records without `verification.recorded` events or `operator` actors
  remain valid; they simply never satisfy operator-gated obligations.
