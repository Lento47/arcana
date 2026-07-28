import { Schema } from "effect"
import { ClaimRef } from "./claim"

// ── Terminal run states ───────────────────────────────────────────────

export const TerminalRunState = Schema.Union([
  Schema.Literal("VERIFIED_COMPLETE"),
  Schema.Literal("PROVABLY_BLOCKED"),
  Schema.Literal("BUDGET_EXHAUSTED"),
  Schema.Literal("DECISION_REQUIRED"),
])
export type TerminalRunState = typeof TerminalRunState.Type

// ── Deliverable ───────────────────────────────────────────────────────

export const Deliverable = Schema.Struct({
  description: Schema.String,
  artifactPattern: Schema.optional(Schema.String),
  verificationMethod: Schema.Union([
    Schema.Literal("observation"),
    Schema.Literal("execution"),
    Schema.Literal("comparison"),
    Schema.Literal("human_decision"),
    Schema.Literal("external_confirmation"),
  ]),
})
export type Deliverable = typeof Deliverable.Type

// ── Constraint ────────────────────────────────────────────────────────

export const Constraint = Schema.Struct({
  description: Schema.String,
  kind: Schema.Union([Schema.Literal("must"), Schema.Literal("must_not"), Schema.Literal("should"), Schema.Literal("should_not")]),
})
export type Constraint = typeof Constraint.Type

// ── Acceptance criterion ──────────────────────────────────────────────

export const AcceptanceCriterion = Schema.Struct({
  id: Schema.String,
  description: Schema.String,
  required: Schema.Boolean,
  verification: Schema.Union([
    Schema.Literal("observation"),
    Schema.Literal("execution"),
    Schema.Literal("comparison"),
    Schema.Literal("human_decision"),
    Schema.Literal("external_confirmation"),
  ]),
})
export type AcceptanceCriterion = typeof AcceptanceCriterion.Type

// ── Completion contract ───────────────────────────────────────────────

export const CompletionContract = Schema.Struct({
  id: Schema.String,
  sessionId: Schema.String,
  objective: Schema.String,
  deliverables: Schema.Array(Deliverable),
  constraints: Schema.Array(Constraint),
  acceptanceCriteria: Schema.Array(AcceptanceCriterion),
  assumptions: Schema.Array(ClaimRef),
  forbiddenOutcomes: Schema.Array(Schema.String),
  riskClass: Schema.Union([
    Schema.Literal("read"),
    Schema.Literal("modify"),
    Schema.Literal("publish"),
    Schema.Literal("irreversible"),
  ]),
  budget: Schema.optional(Schema.Struct({
    maxTokens: Schema.optional(Schema.Number),
    maxCost: Schema.optional(Schema.Number),
    maxWallTime: Schema.optional(Schema.Number),
  })),
  sourceEventId: Schema.String,
  compilerModel: Schema.optional(Schema.String),
  revision: Schema.Number,
  status: Schema.Union([
    Schema.Literal("proposed"),
    Schema.Literal("active"),
    Schema.Literal("amended"),
    Schema.Literal("satisfied"),
  ]),
})
export type CompletionContract = typeof CompletionContract.Type

// ── Completion resolution ─────────────────────────────────────────────

export const CompletionResolution = Schema.Struct({
  state: TerminalRunState,
  reason: Schema.String,
  unresolved: Schema.Array(Schema.Struct({
    criterionId: Schema.String,
    description: Schema.String,
  })),
})
export type CompletionResolution = typeof CompletionResolution.Type
