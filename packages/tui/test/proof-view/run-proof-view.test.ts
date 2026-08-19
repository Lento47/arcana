import { describe, expect, test } from "bun:test"
import { mlEvidenceFromEvents, type RunProofEventView } from "../../src/proof-view/run-proof-view"

describe("run-proof-view mlEvidenceFromEvents", () => {
  test("extracts guardRules from ml.signal event data", () => {
    const events: RunProofEventView[] = [
      {
        timestamp: "2026-08-19T12:00:00Z",
        type: "ml.signal",
        actor: "ml",
        summary: "tool signal for file edit",
        risk: "high",
        status: "recorded",
        refs: {},
        data: {
          kind: "tool",
          signal: {
            toolName: "file_edit",
            risk: "high",
            executionPosture: "approval",
            confidence: 0.87,
            labels: ["destructive"],
            reasons: ["large consecutive deletion detected"],
            guardRules: ["BLOCK_DELETION", "LARGE_CHANGE"],
          },
          decision: {
            action: "require_approval",
            posture: "approval",
            confidence: 0.92,
            reasons: ["guard rule triggered"],
          },
        },
      },
    ]

    const evidence = mlEvidenceFromEvents(events)
    expect(evidence).toHaveLength(1)
    expect(evidence[0].guard_rules).toEqual(["BLOCK_DELETION", "LARGE_CHANGE"])
    expect(evidence[0].tool).toBe("file_edit")
    expect(evidence[0].decision_action).toBe("require_approval")
  })

  test("tolerates missing guardRules", () => {
    const events: RunProofEventView[] = [
      {
        timestamp: "2026-08-19T12:00:00Z",
        type: "ml.signal",
        actor: "ml",
        summary: "turn signal",
        refs: {},
        data: {
          kind: "turn",
          signal: {
            intent: "edit",
            risk: "low",
            executionPosture: "execute",
            confidence: 0.5,
            labels: [],
            reasons: [],
          },
        },
      },
    ]

    const evidence = mlEvidenceFromEvents(events)
    expect(evidence).toHaveLength(1)
    expect(evidence[0].guard_rules).toEqual([])
  })
})
