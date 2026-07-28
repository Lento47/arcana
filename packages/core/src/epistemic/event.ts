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
    ]),
    id: Schema.String,
  }),

  type: Schema.Union([
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
    Schema.Literal("tool.called"),
    Schema.Literal("tool.returned"),
  ]),

  payload: Schema.Unknown,
})
export type ArcanaEvent = typeof ArcanaEvent.Type
