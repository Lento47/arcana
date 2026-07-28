import { Schema } from "effect"

// ── Claim status ──────────────────────────────────────────────────────

export const ClaimStatus = Schema.Union([
  Schema.Literal("observed"),
  Schema.Literal("derived"),
  Schema.Literal("assumed"),
  Schema.Literal("predicted"),
  Schema.Literal("reported"),
  Schema.Literal("contradicted"),
  Schema.Literal("superseded"),
  Schema.Literal("verified"),
])
export type ClaimStatus = typeof ClaimStatus.Type

// ── Evidence ──────────────────────────────────────────────────────────

export const EvidenceRelationship = Schema.Union([
  Schema.Literal("supports"),
  Schema.Literal("contradicts"),
  Schema.Literal("produced_by"),
  Schema.Literal("observed_in"),
  Schema.Literal("verified_by"),
])
export type EvidenceRelationship = typeof EvidenceRelationship.Type

export const EvidenceRef = Schema.Struct({
  eventId: Schema.String,
  artifactDigest: Schema.optional(Schema.String),
  location: Schema.optional(
    Schema.Struct({
      file: Schema.optional(Schema.String),
      lineStart: Schema.optional(Schema.Number),
      lineEnd: Schema.optional(Schema.Number),
    }),
  ),
  relationship: EvidenceRelationship,
})
export type EvidenceRef = typeof EvidenceRef.Type

// ── Claim references ──────────────────────────────────────────────────

export const ClaimRef = Schema.Struct({
  claimId: Schema.String,
})
export type ClaimRef = typeof ClaimRef.Type

// ── Claim ─────────────────────────────────────────────────────────────

export const Claim = Schema.Struct({
  id: Schema.String,
  sessionId: Schema.String,
  proposition: Schema.String,
  status: ClaimStatus,

  scope: Schema.optional(
    Schema.Struct({
      workspace: Schema.optional(Schema.String),
      branch: Schema.optional(Schema.String),
      file: Schema.optional(Schema.String),
      symbol: Schema.optional(Schema.String),
    }),
  ),

  provenance: Schema.Array(EvidenceRef),
  dependencies: Schema.Array(ClaimRef),
  contradicts: Schema.Array(ClaimRef),

  validFrom: Schema.optional(Schema.String),
  validUntil: Schema.optional(Schema.String),
  lastVerifiedAt: Schema.optional(Schema.String),

  confidence: Schema.Number,
  calibrationDomain: Schema.optional(Schema.String),

  createdAt: Schema.String,
  createdByEventId: Schema.String,
})
export type Claim = typeof Claim.Type

// ── Claim outcome (for future calibration) ─────────────────────────────

export const ClaimOutcome = Schema.Struct({
  claimId: Schema.String,
  predictedConfidence: Schema.optional(Schema.Number),
  finalOutcome: Schema.Union([
    Schema.Literal("confirmed"),
    Schema.Literal("refuted"),
    Schema.Literal("partially_confirmed"),
    Schema.Literal("unresolved"),
  ]),
  resolvedBy: Schema.Array(EvidenceRef),
  resolvedAt: Schema.String,
})
export type ClaimOutcome = typeof ClaimOutcome.Type
