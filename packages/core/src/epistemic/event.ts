import { Schema } from "effect"

export const ArcanaEvent = Schema.Struct({
  id: Schema.String,
  sequence: Schema.Number,
  sessionId: Schema.optional(Schema.String),
  timestamp: Schema.String,
  previousHash: Schema.Union([Schema.String, Schema.Null]),
  hash: Schema.String,

  actor: Schema.Struct({
    kind: Schema.Union([
      Schema.Literal("user"),
      Schema.Literal("model"),
      Schema.Literal("tool"),
      Schema.Literal("policy"),
      Schema.Literal("operator"),
    ]),
    id: Schema.String,
  }),

  type: Schema.Union([
    Schema.Literal("session.started"),
    Schema.Literal("session.completed"),
    Schema.Literal("session.crashed"),
    Schema.Literal("contract.proposed"),
    Schema.Literal("contract.activated"),
    Schema.Literal("contract.amended"),
    Schema.Literal("claim.created"),
    Schema.Literal("claim.transitioned"),
    Schema.Literal("evidence.attached"),
    Schema.Literal("obligation.created"),
    Schema.Literal("obligation.resolved"),
    Schema.Literal("completion.attempted"),
    Schema.Literal("completion.resolved"),
    // Phase C: intent lifecycle and explicit compatibility evidence
    Schema.Literal("intent.enforcement_required"),
    Schema.Literal("intent.binding_created"),
    Schema.Literal("intent.binding_revoked"),
    Schema.Literal("intent.compatibility_mode"),
    Schema.Literal("tool.called"),
    Schema.Literal("tool.returned"),
    // Phase C: capability lifecycle
    Schema.Literal("capability.created"),
    Schema.Literal("capability.revoked"),
    Schema.Literal("capability.exhausted"),
    // Phase C: authorization decisions
    Schema.Literal("authorization.requested"),
    Schema.Literal("authorization.allowed"),
    Schema.Literal("authorization.denied"),
    Schema.Literal("authorization.approval_required"),
    Schema.Literal("authorization.stale"),
    Schema.Literal("authorization.executed"),
    Schema.Literal("authorization.execution_failed"),
    // Phase C: explicit operator/verifier outcomes for obligations that
    // cannot be auto-resolved from executed effects (comparison, human
    // decision, external confirmation).
    Schema.Literal("verification.recorded"),
  ]),

  payload: Schema.Unknown,
})
export type ArcanaEvent = typeof ArcanaEvent.Type
