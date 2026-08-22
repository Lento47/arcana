import { describe, expect, test } from "bun:test"
import { runGoalVerifier, type GoalEvidencePacket } from "../../src/session/goal-verifier"

const packet = (patch: Partial<GoalEvidencePacket> = {}): GoalEvidencePacket => ({
  goal: {
    sessionID: "s1",
    goalID: "g1",
    revision: 1,
    goal: "Ship the feature",
    scope: "src",
  },
  contract: {
    id: "c1",
    revision: 1,
    status: "resolved",
    resolutionState: "VERIFIED_COMPLETE",
  },
  obligations: [],
  evidence: [{ id: "evt-1", type: "tool.returned", summary: "tests passed" }],
  traceStatus: "COMPLETE",
  ...patch,
})

const unusedModel = {} as any

describe("independent goal verifier", () => {
  test("fails closed before calling a model when required obligations remain", async () => {
    let calls = 0
    const run = await runGoalVerifier({
      model: unusedModel,
      system: "verify",
      packet: packet({
        obligations: [{
          id: "o1",
          description: "Tests pass",
          required: true,
          status: "pending",
          verification: "test",
        }],
      }),
      generate: async () => {
        calls++
        throw new Error("must not run")
      },
    })
    expect(calls).toBe(0)
    expect(run.result.verdict).toBe("rejected")
    expect(run.result.unmetCriteria).toEqual(["Tests pass"])
  })

  test("rejects verifier evidence references outside the engine packet", async () => {
    const run = await runGoalVerifier({
      model: unusedModel,
      system: "verify",
      packet: packet(),
      generate: async () => ({
        output: {
          verdict: "verified",
          summary: "looks good",
          unmetCriteria: [],
          evidenceRefs: ["invented-event"],
        },
      }),
    })
    expect(run.result.verdict).toBe("rejected")
    expect(run.result.summary).toContain("outside the supplied packet")
  })

  test("accepts a consistent revision-bound verdict with valid evidence", async () => {
    const run = await runGoalVerifier({
      model: unusedModel,
      system: "verify",
      packet: packet(),
      generate: async () => ({
        output: {
          verdict: "verified",
          summary: "The test receipt supports completion",
          unmetCriteria: [],
          evidenceRefs: ["evt-1"],
        },
      }),
    })
    expect(run.result).toEqual({
      verdict: "verified",
      summary: "The test receipt supports completion",
      unmetCriteria: [],
      evidenceRefs: ["evt-1"],
    })
  })

  test("retries one transient failure then returns an infrastructure error", async () => {
    let calls = 0
    const run = await runGoalVerifier({
      model: unusedModel,
      system: "verify",
      packet: packet(),
      generate: async () => {
        calls++
        throw new Error("provider unavailable")
      },
    })
    expect(calls).toBe(2)
    expect(run.attempts).toBe(2)
    expect(run.result.verdict).toBe("error")
    expect(run.result.summary).toContain("provider unavailable")
  })

  test("fails closed without an objective-scoped tool receipt", async () => {
    let calls = 0
    const run = await runGoalVerifier({
      model: unusedModel,
      system: "verify",
      packet: packet({
        evidence: [{ id: "evt-1", type: "authorization.allowed", summary: "permission granted" }],
      }),
      generate: async () => {
        calls++
        return { output: { verdict: "verified", summary: "done", unmetCriteria: [], evidenceRefs: [] } }
      },
    })
    expect(calls).toBe(0)
    expect(run.result.verdict).toBe("rejected")
    expect(run.result.summary).toContain("No objective-scoped tool execution receipt")
  })
})
