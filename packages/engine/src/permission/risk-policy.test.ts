import { describe, expect, test } from "bun:test"
import { riskRequiresFreshAsk, riskRequiresInitialAsk, shouldAskAfterRisk } from "./risk-policy"
import type { PermissionV1 } from "@arcana/core/v1/permission"
import type { RiskAssessment } from "@/execution"

const allowRule: PermissionV1.Rule = { permission: "bash", pattern: "*", action: "allow" }
const askRule: PermissionV1.Rule = { permission: "bash", pattern: "*", action: "ask" }
const denyRule: PermissionV1.Rule = { permission: "bash", pattern: "*", action: "deny" }

const approvalRisk: RiskAssessment = {
  level: "medium",
  reasons: ["requires approval"],
  required_controls: ["approval"],
}

const humanReviewRisk: RiskAssessment = {
  level: "medium",
  reasons: ["requires human review"],
  required_controls: ["human_review"],
}

const highRisk: RiskAssessment = {
  level: "high",
  reasons: ["high risk action"],
  required_controls: ["approval"],
}

describe("permission risk policy", () => {
  test("medium approval risk requires an initial ask", () => {
    expect(riskRequiresInitialAsk(approvalRisk)).toBe(true)
    expect(riskRequiresFreshAsk(approvalRisk)).toBe(false)
  })

  test("human review risk requires a fresh ask", () => {
    expect(riskRequiresInitialAsk(humanReviewRisk)).toBe(true)
    expect(riskRequiresFreshAsk(humanReviewRisk)).toBe(true)
  })

  test("high risk requires a fresh ask even with approval controls", () => {
    expect(riskRequiresInitialAsk(highRisk)).toBe(true)
    expect(riskRequiresFreshAsk(highRisk)).toBe(true)
  })

  test("configured allow still asks for first medium approval risk", () => {
    expect(
      shouldAskAfterRisk({
        configuredRule: allowRule,
        approvedRule: askRule,
        risk: approvalRisk,
      }),
    ).toBe(true)
  })

  test("approved allow satisfies medium approval risk", () => {
    expect(
      shouldAskAfterRisk({
        configuredRule: allowRule,
        approvedRule: allowRule,
        risk: approvalRisk,
      }),
    ).toBe(false)
  })

  test("approved allow does not satisfy high risk", () => {
    expect(
      shouldAskAfterRisk({
        configuredRule: allowRule,
        approvedRule: allowRule,
        risk: highRisk,
      }),
    ).toBe(true)
  })

  test("configured deny always asks so caller can deny", () => {
    expect(
      shouldAskAfterRisk({
        configuredRule: denyRule,
        approvedRule: allowRule,
        risk: undefined,
      }),
    ).toBe(true)
  })
})
