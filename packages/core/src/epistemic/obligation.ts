import { Schema } from "effect"
import { EvidenceRef } from "./claim"

// ── Obligation verification method ────────────────────────────────────

export const ObligationVerification = Schema.Union([
  Schema.Literal("observation"),
  Schema.Literal("execution"),
  Schema.Literal("comparison"),
  Schema.Literal("human_decision"),
  Schema.Literal("external_confirmation"),
])
export type ObligationVerification = typeof ObligationVerification.Type

// ── Obligation status ─────────────────────────────────────────────────

export const ObligationStatus = Schema.Union([
  Schema.Literal("pending"),
  Schema.Literal("satisfied"),
  Schema.Literal("failed"),
  Schema.Literal("waived"),
  Schema.Literal("not_applicable"),
])
export type ObligationStatus = typeof ObligationStatus.Type

// ── Obligation source ─────────────────────────────────────────────────

export const ObligationSource = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("registry"), ruleId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("acceptance_criterion"), criterionId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("agent"), reason: Schema.String }),
])
export type ObligationSource = typeof ObligationSource.Type

// ── Proof obligation ──────────────────────────────────────────────────

export const ProofObligation = Schema.Struct({
  id: Schema.String,
  contractId: Schema.String,
  source: ObligationSource,
  description: Schema.String,
  required: Schema.Boolean,
  verification: ObligationVerification,
  status: ObligationStatus,
  evidence: Schema.Array(EvidenceRef),
  createdAt: Schema.String,
  resolvedAt: Schema.optional(Schema.String),
  waivedByEventId: Schema.optional(Schema.String),
  waiverReason: Schema.optional(Schema.String),
})
export type ProofObligation = typeof ProofObligation.Type

// ── Obligation template (baseline registry) ────────────────────────────

export const ObligationTemplate = Schema.Struct({
  ruleId: Schema.String,
  description: Schema.String,
  trigger: Schema.Union([
    Schema.Literal("file_content_assertion"),
    Schema.Literal("symbol_existence_assertion"),
    Schema.Literal("command_success_assertion"),
    Schema.Literal("bug_fixed_assertion"),
    Schema.Literal("regression_free_assertion"),
    Schema.Literal("build_success_assertion"),
    Schema.Literal("deployment_success_assertion"),
    Schema.Literal("external_current_fact_assertion"),
    Schema.Literal("security_safe_assertion"),
    Schema.Literal("requirement_complete_assertion"),
  ]),
  verification: ObligationVerification,
  required: Schema.Boolean,
})
export type ObligationTemplate = typeof ObligationTemplate.Type

// ── Baseline templates ────────────────────────────────────────────────

export const BASELINE_TEMPLATES: ObligationTemplate[] = [
  { ruleId: "file-content", description: "File must contain the asserted content", trigger: "file_content_assertion", verification: "observation", required: true },
  { ruleId: "symbol-exists", description: "Symbol must exist in the codebase", trigger: "symbol_existence_assertion", verification: "observation", required: true },
  { ruleId: "command-success", description: "Command must exit with code 0", trigger: "command_success_assertion", verification: "execution", required: true },
  { ruleId: "bug-fixed", description: "Bug reproduction must fail before fix and pass after", trigger: "bug_fixed_assertion", verification: "execution", required: true },
  { ruleId: "regression-free", description: "Relevant regression suite must pass", trigger: "regression_free_assertion", verification: "execution", required: true },
  { ruleId: "build-success", description: "Project must build without errors", trigger: "build_success_assertion", verification: "execution", required: true },
  { ruleId: "deployment-success", description: "Deployment must succeed in target environment", trigger: "deployment_success_assertion", verification: "external_confirmation", required: true },
  { ruleId: "external-fact", description: "External claim must be verified via primary source", trigger: "external_current_fact_assertion", verification: "external_confirmation", required: true },
  { ruleId: "security-safe", description: "Dependency or change must pass security policy", trigger: "security_safe_assertion", verification: "human_decision", required: true },
  { ruleId: "requirement-complete", description: "All stated requirements must have supporting evidence", trigger: "requirement_complete_assertion", verification: "execution", required: true },
]
