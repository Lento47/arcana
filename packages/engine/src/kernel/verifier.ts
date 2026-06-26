// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"

export const ArcanaVerificationID = Schema.String.pipe(Schema.brand("ArcanaVerificationID"))
export type ArcanaVerificationID = typeof ArcanaVerificationID.Type

/**
 * Verification is NOT agent self-assessment. The verifier authority owns
 * the "done" decision. An agent may claim completion; the verifier judges it.
 */
export const ArcanaVerificationVerdict = Schema.Literals([
  "pending",
  "running",
  "passed",
  "failed",
  "skipped",
  "inconclusive",
])
export type ArcanaVerificationVerdict = typeof ArcanaVerificationVerdict.Type

export const ArcanaVerificationEvidenceKind = Schema.Literals([
  "test_output",
  "lint_output",
  "typecheck_output",
  "build_output",
  "git_diff",
  "shell_stdout",
  "runproof_log",
  "approval_record",
  "rollback_drill",
  "manual_confirmation",
  "security_scan",
  "sarif_report",
  "sbom_report",
  "osv_report",
  "benchmark",
  "candidate_evaluation",
  "policy_record",
])
export type ArcanaVerificationEvidenceKind = typeof ArcanaVerificationEvidenceKind.Type

export const ArcanaVerificationEvidence = Schema.Struct({
  kind: ArcanaVerificationEvidenceKind,
  summary: Schema.String,
  passed: Schema.Boolean,
  detail: Schema.optional(Schema.String),
  artifact_path: Schema.optional(Schema.String),
  timestamp: Schema.String,
})
export type ArcanaVerificationEvidence = typeof ArcanaVerificationEvidence.Type

/**
 * A verification run is a single pass over a set of evidence sources.
 * Multiple runs can chain: a failed run → fix → re-verify.
 */
export const ArcanaVerificationRun = Schema.Struct({
  id: ArcanaVerificationID,
  mutation_id: Schema.String,
  verdict: ArcanaVerificationVerdict,
  started_at: Schema.String,
  ended_at: Schema.optional(Schema.String),
  evidence: Schema.Array(ArcanaVerificationEvidence),
  required_checks: Schema.Array(Schema.String),
  failures: Schema.Array(Schema.String),
  retries: Schema.Number,
})
export type ArcanaVerificationRun = typeof ArcanaVerificationRun.Type

/**
 * Before an agent can claim "done", every required verifier gate must pass.
 * No evidence = not done. Failed evidence = not done. Skipped without
 * justification = not done.
 */
export function verifierGatesSatisfied(run: ArcanaVerificationRun): boolean {
  if (run.evidence.length === 0) return false
  if (run.failures.length > 0) return false
  if (run.evidence.some((e) => !e.passed)) return false
  if (run.verdict === "pending" || run.verdict === "running" || run.verdict === "failed" || run.verdict === "inconclusive") return false
  if (run.verdict === "skipped") return run.evidence.some((e) => Boolean(e.detail) || e.kind === "manual_confirmation")
  return run.verdict === "passed"
}

/**
 * Completion is not "the agent stopped talking." It requires:
 * 1. All required checks executed
 * 2. Verdict is passed (or skipped with justification)
 * 3. Evidence exists for every check
 */
export function completionGatesSatisfied(
  run: ArcanaVerificationRun,
  requiredChecks: readonly string[] = run.required_checks,
): boolean {
  if (!verifierGatesSatisfied(run)) return false
  const executed = new Set(run.evidence.map((e) => e.kind))
  for (const check of requiredChecks) {
    if (!executed.has(check as ArcanaVerificationEvidenceKind)) return false
  }
  return true
}

/**
 * Default required checks for a code-change run. The verifier can expand
 * this based on risk level and mutation scope.
 */
export function defaultRequiredChecks(): string[] {
  return ["test_output", "typecheck_output", "lint_output", "git_diff"]
}

/**
 * Required checks for security-sensitive changes. This extends the normal
 * software evidence set with scanner, policy, and human-review evidence.
 */
export function securityRequiredChecks(): string[] {
  return [
    ...defaultRequiredChecks(),
    "security_scan",
    "policy_record",
    "approval_record",
    "manual_confirmation",
  ]
}

/**
 * Required checks for forge/candidate-search work. Improvement claims must
 * be benchmarked and linked to candidate evaluation evidence.
 */
export function forgeRequiredChecks(): string[] {
  return [
    "test_output",
    "benchmark",
    "candidate_evaluation",
    "git_diff",
    "runproof_log",
  ]
}

/**
 * Known limitations that should be surfaced to the user rather than
 * hidden behind a "passed" verdict. The verifier carries doubt forward.
 */
export const ArcanaVerifierLimitation = Schema.Struct({
  check: Schema.String,
  description: Schema.String,
  severity: Schema.Literals(["info", "warning", "blocking"]),
  mitigation: Schema.optional(Schema.String),
})
export type ArcanaVerifierLimitation = typeof ArcanaVerifierLimitation.Type

/**
 * A verification run record — persisted to RunProof evidence stream.
 */
export const ArcanaVerifierRecord = Schema.Struct({
  run: ArcanaVerificationRun,
  limitations: Schema.Array(ArcanaVerifierLimitation),
  completion_gate_passed: Schema.Boolean,
})
export type ArcanaVerifierRecord = typeof ArcanaVerifierRecord.Type

export function createVerificationRun(
  mutationId: string,
  requiredChecks: string[],
): ArcanaVerificationRun {
  return {
    id: `vr_${crypto.randomUUID()}` as ArcanaVerificationID,
    mutation_id: mutationId,
    verdict: "pending",
    started_at: new Date().toISOString(),
    evidence: [],
    required_checks: requiredChecks,
    failures: [],
    retries: 0,
  }
}

export function createVerifierRecord(
  run: ArcanaVerificationRun,
  limitations: ArcanaVerifierLimitation[],
): ArcanaVerifierRecord {
  return {
    run,
    limitations,
    completion_gate_passed: completionGatesSatisfied(run, run.required_checks),
  }
}
