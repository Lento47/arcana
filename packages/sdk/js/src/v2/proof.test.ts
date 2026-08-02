import { describe, expect, it } from "bun:test"
import { proofFingerprint, verifyRunProofExport } from "./proof.js"

function makeProof(overrides: Record<string, unknown> = {}) {
  const proof = {
    id: "run_01J",
    schema_version: "0.2",
    timestamp: "2026-08-02T12:00:00.000Z",
    repo: { root: "/workspace", branch: "main" },
    user_intent: "inspect the shell",
    lifecycle: { status: "completed", started_at: "2026-08-02T11:00:00.000Z", ended_at: "2026-08-02T12:00:00.000Z" },
    contract: { objective: "inspect", risk: "low" },
    events: [
      { id: "evt-1", timestamp: "2026-08-02T11:00:00.000Z", type: "plan.created", actor: "system", summary: "plan" },
      { id: "evt-2", timestamp: "2026-08-02T11:05:00.000Z", type: "command.executed", actor: "agent", summary: "run" },
    ],
    ...overrides,
  }
  return proof
}

describe("SDK RunProof verifier (E3)", () => {
  it("verifies a structurally valid exported proof and computes a fingerprint", () => {
    const result = verifyRunProofExport(JSON.stringify(makeProof()))
    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.fingerprint.length).toBe(64)
    expect(result.checks).toContain("events array present")
  })

  it("accepts an embedded fingerprint when it matches", () => {
    const proof = makeProof() as { fingerprint?: string } & Record<string, unknown>
    proof.fingerprint = proofFingerprint(proof as never)
    const result = verifyRunProofExport(JSON.stringify(proof))
    expect(result.valid).toBe(true)
  })

  it("rejects tampered events via fingerprint mismatch", () => {
    const proof = makeProof() as { fingerprint?: string } & Record<string, unknown>
    proof.fingerprint = proofFingerprint(proof as never)
    const events = (proof as { events: Array<{ summary: string }> }).events
    events[1]!.summary = "tampered"
    const result = verifyRunProofExport(JSON.stringify(proof))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("fingerprint mismatch")
  })

  it("rejects unsupported schema versions and missing lifecycle fields", () => {
    expect(verifyRunProofExport(JSON.stringify(makeProof({ schema_version: "9.9" }))).valid).toBe(false)
    expect(verifyRunProofExport(JSON.stringify(makeProof({ lifecycle: { status: "completed" } }))).valid).toBe(false)
  })

  it("rejects out-of-order event timestamps", () => {
    const proof = makeProof()
    ;(proof as { events: Array<{ timestamp: string }> }).events[1]!.timestamp = "2026-08-02T10:00:00.000Z"
    const result = verifyRunProofExport(JSON.stringify(proof))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("out of order")
  })
})
