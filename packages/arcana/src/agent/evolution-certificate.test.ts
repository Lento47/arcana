// packages/arcana/src/agent/evolution-certificate.test.ts
// Authority Kernel K9 — evolution certificate gate tests.

import { describe, expect, it } from "bun:test"
import {
  evaluatePromotion,
  verifyStoredCertificate,
  type EvolutionCertificate,
} from "./evolution-certificate"

const goodEvidence = {
  metric: "llm_judge_paired_10",
  candidateValue: 7.5,
  baselineValue: 6.5,
  sampleCount: 3,
}

describe("evolution certificate gate (K9)", () => {
  it("promotes on paired superiority beyond margin with separation of duties", () => {
    const d = evaluatePromotion({
      candidateId: "v123",
      candidateHash: "abc",
      proposedBy: "arcana-evolver",
      evaluatedBy: "arcana-judge",
      evidence: goodEvidence,
    })
    expect(d.verdict).toBe("promote")
    if (d.verdict === "promote") {
      expect(d.certificate.evaluatedBy).toBe("arcana-judge")
      expect(d.certificate.authorizedBy).toContain("k9-promotion-policy")
    }
  })

  it("rejects self-evaluation (proposer === evaluator)", () => {
    const d = evaluatePromotion({
      candidateId: "v123",
      candidateHash: "abc",
      proposedBy: "same",
      evaluatedBy: "same",
      evidence: { ...goodEvidence, candidateValue: 10, baselineValue: 1 },
    })
    expect(d.verdict).toBe("reject")
  })

  it("rejects insufficient sample counts", () => {
    const d = evaluatePromotion({
      candidateId: "v123",
      candidateHash: "abc",
      proposedBy: "p",
      evaluatedBy: "j",
      evidence: { ...goodEvidence },
      minSamples: 5,
    })
    expect(d.verdict).toBe("reject")
    if (d.verdict === "reject") expect(d.reason).toContain("insufficient samples")
  })

  it("rejects candidates that merely tie the incumbent", () => {
    const d = evaluatePromotion({
      candidateId: "v123",
      candidateHash: "abc",
      proposedBy: "p",
      evaluatedBy: "j",
      evidence: { ...goodEvidence, candidateValue: 6.5, baselineValue: 6.5 },
    })
    expect(d.verdict).toBe("reject")
    if (d.verdict === "reject") expect(d.reason).toContain("paired superiority")
  })

  it("binds the certificate to the exact candidate bytes", () => {
    const a = evaluatePromotion({
      candidateId: "vA", candidateHash: "hash-A", proposedBy: "p", evaluatedBy: "j", evidence: goodEvidence,
    })
    const b = evaluatePromotion({
      candidateId: "vB", candidateHash: "hash-B", proposedBy: "p", evaluatedBy: "j", evidence: goodEvidence,
    })
    if (a.verdict === "promote" && b.verdict === "promote") {
      expect(a.certificate.candidateHash).not.toBe(b.certificate.candidateHash)
    }
  })

  it("integrity hash detects post-hoc edits of stored certificates", () => {
    const d = evaluatePromotion({
      candidateId: "v123", candidateHash: "h", proposedBy: "p", evaluatedBy: "j", evidence: goodEvidence,
    })
    expect(d.verdict).toBe("promote")
    if (d.verdict !== "promote") return
    const stored = { ...d.certificate, integrityHash: require("./evolution-certificate").certificateIntegrityHash(d.certificate) } as EvolutionCertificate & { integrityHash?: string }
    expect(verifyStoredCertificate(stored).intact).toBe(true)

    // Tamper: bump the score after the fact.
    const forged = JSON.parse(JSON.stringify(stored)) as typeof stored
    forged.evidence.candidateValue = 99.9
    expect(verifyStoredCertificate(forged).intact).toBe(false)
  })
})
