import { describe, expect, test } from "bun:test"
import {
  defaultApprovalRoutingPolicy,
  isCentralDecision,
  isLocalDecisionAllowed,
  resolveApprovalRoute,
  type ApprovalRoute,
  type ApprovalRoutingInput,
  type ApprovalRoutingPolicy,
  type DecisionSurface,
} from "@arcana/core/crypto/approval-routing"

function input(overrides: Partial<ApprovalRoutingInput> = {}): ApprovalRoutingInput {
  return {
    sessionId: "sess-a",
    workspaceId: "ws-a",
    action: "git.push",
    riskClass: "HIGH",
    deploymentMode: "LOCAL",
    desktopOnline: false,
    requestId: "req-1",
    requestHash: "hash-1",
    ...overrides,
  }
}

function policyFor(route: ApprovalRoute, localFallbackAllowed: boolean): ApprovalRoutingPolicy {
  return {
    policyVersion: "matrix-test-v1",
    defaultRoute: route,
    defaultLocalFallbackAllowed: localFallbackAllowed,
    rules: [],
  }
}

/**
 * TUI-2.1 runbook matrix: every approval route x every Desktop availability
 * x fallback permission must resolve to exactly one decision surface. The TUI
 * may decide ONLY on LOCAL_TUI; DESKTOP/CENTRAL/PENDING surfaces never offer
 * local a/d authority (the engine routing gate enforces the same matrix).
 */
describe("approval routing decision-surface matrix (TUI-2.1)", () => {
  test("LOCAL_TUI always resolves to the local TUI surface, online or offline", () => {
    for (const desktopOnline of [true, false]) {
      const resolution = resolveApprovalRoute(policyFor("LOCAL_TUI", true), input({ desktopOnline }))
      expect(resolution.route).toBe("LOCAL_TUI")
      expect(resolution.decisionSurface).toBe("LOCAL_TUI")
      expect(isLocalDecisionAllowed(resolution)).toBe(true)
      expect(isCentralDecision(resolution)).toBe(false)
    }
  })

  test("DESKTOP_PREFERRED: Desktop when online; TUI only offline with explicit fallback; PENDING otherwise", () => {
    const fallback = policyFor("DESKTOP_PREFERRED", true)
    const noFallback = policyFor("DESKTOP_PREFERRED", false)

    const online = resolveApprovalRoute(fallback, input({ desktopOnline: true }))
    expect(online.decisionSurface).toBe("DESKTOP")
    expect(isLocalDecisionAllowed(online)).toBe(false)

    const offlineFallback = resolveApprovalRoute(fallback, input({ desktopOnline: false }))
    expect(offlineFallback.decisionSurface).toBe("LOCAL_TUI")
    expect(isLocalDecisionAllowed(offlineFallback)).toBe(true)

    const offlineNoFallback = resolveApprovalRoute(noFallback, input({ desktopOnline: false }))
    expect(offlineNoFallback.decisionSurface).toBe("PENDING")
    expect(isLocalDecisionAllowed(offlineNoFallback)).toBe(false)
  })

  test("DESKTOP_REQUIRED: Desktop when online; PENDING offline with no silent local fallback", () => {
    const policy = policyFor("DESKTOP_REQUIRED", false)

    const online = resolveApprovalRoute(policy, input({ desktopOnline: true }))
    expect(online.decisionSurface).toBe("DESKTOP")
    expect(isLocalDecisionAllowed(online)).toBe(false)

    const offline = resolveApprovalRoute(policy, input({ desktopOnline: false }))
    expect(offline.decisionSurface).toBe("PENDING")
    expect(isLocalDecisionAllowed(offline)).toBe(false)
  })

  test("CENTRAL_REQUIRED: central decision always; local and Desktop never decide", () => {
    for (const desktopOnline of [true, false]) {
      const resolution = resolveApprovalRoute(
        policyFor("CENTRAL_REQUIRED", false),
        input({ desktopOnline }),
      )
      expect(resolution.decisionSurface).toBe("CENTRAL")
      expect(resolution.route).toBe("CENTRAL_REQUIRED")
      expect(isLocalDecisionAllowed(resolution)).toBe(false)
      expect(isCentralDecision(resolution)).toBe(true)
    }
  })

  test("full matrix snapshot: route x desktopOnline x fallback -> decision surface", () => {
    const cases: Array<{
      route: ApprovalRoute
      desktopOnline: boolean
      fallback: boolean
      surface: DecisionSurface
    }> = [
      { route: "LOCAL_TUI", desktopOnline: false, fallback: true, surface: "LOCAL_TUI" },
      { route: "LOCAL_TUI", desktopOnline: true, fallback: true, surface: "LOCAL_TUI" },
      { route: "DESKTOP_PREFERRED", desktopOnline: false, fallback: true, surface: "LOCAL_TUI" },
      { route: "DESKTOP_PREFERRED", desktopOnline: false, fallback: false, surface: "PENDING" },
      { route: "DESKTOP_PREFERRED", desktopOnline: true, fallback: true, surface: "DESKTOP" },
      { route: "DESKTOP_PREFERRED", desktopOnline: true, fallback: false, surface: "DESKTOP" },
      { route: "DESKTOP_REQUIRED", desktopOnline: false, fallback: false, surface: "PENDING" },
      { route: "DESKTOP_REQUIRED", desktopOnline: true, fallback: false, surface: "DESKTOP" },
      { route: "CENTRAL_REQUIRED", desktopOnline: false, fallback: false, surface: "CENTRAL" },
      { route: "CENTRAL_REQUIRED", desktopOnline: true, fallback: false, surface: "CENTRAL" },
    ]

    for (const c of cases) {
      const resolution = resolveApprovalRoute(
        policyFor(c.route, c.fallback),
        input({ desktopOnline: c.desktopOnline }),
      )
      expect(resolution.decisionSurface, `${c.route} online=${c.desktopOnline} fallback=${c.fallback}`).toBe(
        c.surface,
      )
      // TUI a/d authority is exactly the LOCAL_TUI surface.
      expect(isLocalDecisionAllowed(resolution), c.route).toBe(c.surface === "LOCAL_TUI")
    }
  })

  test("default policies harden by deployment mode: LOCAL stays TUI, HYBRID prefers Desktop for HIGH risk and requires it for deploy, ENTERPRISE is central-only", () => {
    const local = defaultApprovalRoutingPolicy("LOCAL")
    expect(resolveApprovalRoute(local, input()).decisionSurface).toBe("LOCAL_TUI")

    const hybrid = defaultApprovalRoutingPolicy("HYBRID")
    expect(resolveApprovalRoute(hybrid, input({ riskClass: "HIGH", desktopOnline: true })).decisionSurface).toBe(
      "DESKTOP",
    )
    expect(
      resolveApprovalRoute(hybrid, input({ riskClass: "HIGH", desktopOnline: false })).decisionSurface,
    ).toBe("LOCAL_TUI") // defaultLocalFallbackAllowed=true keeps ordinary work unstranded
    expect(
      resolveApprovalRoute(hybrid, input({ action: "deploy", desktopOnline: false })).decisionSurface,
    ).toBe("PENDING") // deploy is DESKTOP_REQUIRED, fallback forbidden

    const enterprise = defaultApprovalRoutingPolicy("ENTERPRISE")
    expect(resolveApprovalRoute(enterprise, input()).decisionSurface).toBe("CENTRAL")
    expect(isLocalDecisionAllowed(resolveApprovalRoute(enterprise, input()))).toBe(false)
  })

  test("selector precedence: workspace, action, capability, risk class, deployment mode; first rule wins", () => {
    const policy: ApprovalRoutingPolicy = {
      policyVersion: "selector-v1",
      defaultRoute: "LOCAL_TUI",
      defaultLocalFallbackAllowed: true,
      rules: [
        { id: "ws-rule", route: "DESKTOP_REQUIRED", workspace: "ws-secure" },
        { id: "deploy-rule", route: "DESKTOP_REQUIRED", action: "deploy", deploymentModes: ["HYBRID"] },
        { id: "risk-rule", route: "CENTRAL_REQUIRED", riskClass: ["CRITICAL"], deploymentModes: ["ENTERPRISE"] },
        { id: "cap-rule", route: "DESKTOP_PREFERRED", capabilityId: "cap-123", localFallbackAllowed: false },
      ],
    }

    expect(resolveApprovalRoute(policy, input({ workspaceId: "ws-secure" })).ruleId).toBe("ws-rule")
    expect(
      resolveApprovalRoute(policy, input({ action: "deploy", deploymentMode: "HYBRID" })).ruleId,
    ).toBe("deploy-rule")
    expect(
      resolveApprovalRoute(policy, input({ riskClass: "CRITICAL", deploymentMode: "ENTERPRISE" })).ruleId,
    ).toBe("risk-rule")
    expect(resolveApprovalRoute(policy, input({ capabilityId: "cap-123" })).ruleId).toBe("cap-rule")
    expect(resolveApprovalRoute(policy, input()).ruleId).toBeUndefined()
  })
})
