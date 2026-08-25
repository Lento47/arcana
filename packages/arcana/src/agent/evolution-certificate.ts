// packages/arcana/src/agent/evolution-certificate.ts
//
// Authority Kernel K9 — Evolution Certificates.
//
// A candidate mutation (prompt/skill/config) may only be promoted over the
// incumbent when a CERTIFICATE attests to the decision:
//
//   proposed_by ≠ evaluated_by        (no self-grading)
//   evidence present                  (paired scores on a stated metric)
//   superiority beyond margin         (candidate beats incumbent, not just exists)
//   minimum sample count              (noise floor respected)
//   candidate bound by content hash   (certificate ↔ exact text)
//
// v1 honesty note: the evaluator is an LLM judge over a shared rubric —
// empirical-but-not-ground-truth. sampleCount reflects how many independent
// judgment samples back the comparison. Held-out task evaluation supersedes
// this in a later revision; the CERTIFICATE SHAPE is stable across both.

import { createHash } from "node:crypto"

export interface EvolutionEvidence {
  /** Metric compared (e.g. "llm_judge_paired_10", "held_out_success_rate"). */
  metric: string
  /** Candidate's measured value on the metric. */
  candidateValue: number
  /** Incumbent's measured value on the same metric/samples. */
  baselineValue: number
  /** Independent judgment samples backing the comparison. */
  sampleCount: number
  /** Verified trajectory/session ids the evaluation drew from. */
  sourceRunIds?: string[]
}

export interface EvolutionCertificate {
  certificateId: string
  candidateId: string
  /** Hash of the EXACT candidate artifact (binds cert ⇔ bytes). */
  candidateHash: string
  proposedBy: string
  evaluatedBy: string
  authorizedBy: string
  decidedAt: number
  verdict: "promote" | "reject"
  evidence: EvolutionEvidence
}

export interface PromotionGateInput {
  candidateId: string
  candidateHash: string
  proposedBy: string
  evaluatedBy: string
  evidence: EvolutionEvidence
  /** Minimum paired-margin required to promote (metric units). Defaults 0.5. */
  minMargin?: number
  /** Minimum independent samples required. Defaults 1. */
  minSamples?: number
  decidedAt?: number
}

export type PromotionDecision =
  | { verdict: "promote"; certificate: EvolutionCertificate }
  | { verdict: "reject"; reason: string }

const CONSTITUTION_NOTE =
  "Prompt/skill candidates are strategy-class; constitution surfaces are excluded upstream."

/**
 * Pure promotion gate — no I/O. Enforces the certificate algebra:
 *   1. separation of duties (evaluatedBy ≠ proposedBy)
 *   2. evidence present with sane values
 *   3. minimum sample count
 *   4. strict paired superiority beyond margin
 * Returns a signed-shape certificate on promote; a rejection reason otherwise.
 */
export function evaluatePromotion(input: PromotionGateInput): PromotionDecision {
  const minMargin = input.minMargin ?? 0.5
  const minSamples = input.minSamples ?? 1

  if (input.proposedBy === input.evaluatedBy) {
    return { verdict: "reject", reason: "separation-of-duties: proposer cannot evaluate own candidate" }
  }
  const e = input.evidence
  if (
    typeof e.candidateValue !== "number" ||
    typeof e.baselineValue !== "number" ||
    !Number.isFinite(e.candidateValue) ||
    !Number.isFinite(e.baselineValue)
  ) {
    return { verdict: "reject", reason: "evidence values must be finite numbers" }
  }
  if (!e.metric || e.metric.length === 0) {
    return { verdict: "reject", reason: "evidence must name its metric" }
  }
  if (e.sampleCount < minSamples) {
    return {
      verdict: "reject",
      reason: `insufficient samples: ${e.sampleCount} < ${minSamples}`,
    }
  }
  const margin = e.candidateValue - e.baselineValue
  if (!(margin >= minMargin)) {
    return {
      verdict: "reject",
      reason: `paired superiority not met: margin ${margin.toFixed(3)} < ${minMargin} (${input.evidence.metric})`,
    }
  }

  const certificate: EvolutionCertificate = {
    certificateId: `cert-${createHash("sha256").update(`${input.candidateHash}|${input.decidedAt ?? Date.now()}`).digest("hex").slice(0, 16)}`,
    candidateId: input.candidateId,
    candidateHash: input.candidateHash,
    proposedBy: input.proposedBy,
    evaluatedBy: input.evaluatedBy,
    authorizedBy: "authority-kernel:k9-promotion-policy",
    decidedAt: input.decidedAt ?? Date.now(),
    verdict: "promote",
    evidence: { ...e },
  }
  void CONSTITUTION_NOTE
  return { verdict: "promote", certificate }
}

/** Tamper-evident integrity hash over a persisted certificate. */
export function certificateIntegrityHash(cert: EvolutionCertificate): string {
  return createHash("sha256").update(stableStringify(cert)).digest("hex")
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`
}

/** Recompute integrity and detect any post-hoc edit of a stored certificate. */
export function verifyStoredCertificate(
  stored: EvolutionCertificate & { integrityHash?: string },
): { intact: boolean } {
  if (!stored.integrityHash) return { intact: false }
  const clone: EvolutionCertificate & { integrityHash?: string } = { ...stored }
  const expected = clone.integrityHash
  delete (clone as unknown as Record<string, unknown>).integrityHash
  const actual = certificateIntegrityHash(clone as EvolutionCertificate)
  return { intact: actual === expected }
}
