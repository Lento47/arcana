import { describe, expect, test } from "bun:test"
import {
  defaultApprovalRoutingPolicy,
  resolveApprovalRoute,
  type ApprovalRoutingInput,
  type ApprovalRoutingPolicy,
} from "./approval-routing"

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

describe("approval routing resolution (Phase D)", () => {
  test("LOCAL_TUI always resolves to the local TUI surface", () => {
    const policy: ApprovalRoutingPolicy = {
      policyVersion: "t",
      defaultRoute: "LOCAL_TUI",
      defaultLocalFallbackAllowed: true,
      rules: [],
    }
    const resolution = resolveApprovalRoute(policy, input())
    expect(resolution.route).toBe("LOCAL_TUI")
    expect(resolution.decisionSurface).toBe("LOCAL_TUI")
    expect(resolution.policyVersion).toBe("t")
  })

  test("DESKTOP_PREFERRED routes to Desktop when online", () => {
    const policy: ApprovalRoutingPolicy = {
      policyVersion: "t",
      defaultRoute: "DESKTOP_PREFERRED",
      defaultLocalFallbackAllowed: true,
      rules: [],
    }
    const resolution = resolveApprovalRoute(policy, input({ desktopOnline: true }))
    expect(resolution.decisionSurface).toBe("DESKTOP")
  })

  test("DESKTOP_PREFERRED falls back to TUI offline when policy permits", () => {
    const policy: ApprovalRoutingPolicy = {
      policyVersion: "t",
      defaultRoute: "DESKTOP_PREFERRED",
      defaultLocalFallbackAllowed: true,
      rules: [],
    }
    const resolution = resolveApprovalRoute(policy, input({ desktopOnline: false }))
    expect(resolution.decisionSurface).toBe("LOCAL_TUI")
  })

  test("DESKTOP_PREFERRED stays PENDING offline when fallback is forbidden", () => {
    const policy: ApprovalRoutingPolicy = {
      policyVersion: "t",
      defaultRoute: "DESKTOP_PREFERRED",
      defaultLocalFallbackAllowed: false,
      rules: [],
    }
    const resolution = resolveApprovalRoute(policy, input({ desktopOnline: false }))
    expect(resolution.decisionSurface).toBe("PENDING")
  })

  test("DESKTOP_REQUIRED stays PENDING offline with no silent fallback", () => {
    const policy: ApprovalRoutingPolicy = {
      policyVersion: "t",
      defaultRoute: "DESKTOP_REQUIRED",
      defaultLocalFallbackAllowed: false,
      rules: [],
    }
    expect(resolveApprovalRoute(policy, input({ desktopOnline: false })).decisionSurface).toBe("PENDING")
    expect(resolveApprovalRoute(policy, input({ desktopOnline: true })).decisionSurface).toBe("DESKTOP")
  })

  test("CENTRAL_REQUIRED never lets local surfaces decide", () => {
    const policy: ApprovalRoutingPolicy = {
      policyVersion: "t",
      defaultRoute: "CENTRAL_REQUIRED",
      defaultLocalFallbackAllowed: false,
      rules: [],
    }
    for (const desktopOnline of [true, false]) {
      const resolution = resolveApprovalRoute(policy, input({ desktopOnline }))
      expect(resolution.decisionSurface).toBe("CENTRAL")
      expect(resolution.route).toBe("CENTRAL_REQUIRED")
    }
  })

  test("rules match by workspace, action, capability, risk class, and deployment mode; first rule wins", () => {
    const policy: ApprovalRoutingPolicy = {
      policyVersion: "t",
      defaultRoute: "LOCAL_TUI",
      defaultLocalFallbackAllowed: true,
      rules: [
        {
          id: "ws-rule",
          route: "DESKTOP_REQUIRED",
          workspace: "ws-secure",
        },
        {
          id: "deploy-rule",
          route: "DESKTOP_REQUIRED",
          action: "deploy",
          deploymentModes: ["HYBRID"],
        },
        {
          id: "risk-rule",
          route: "CENTRAL_REQUIRED",
          riskClass: ["CRITICAL"],
          deploymentModes: ["ENTERPRISE"],
        },
        {
          id: "cap-rule",
          route: "DESKTOP_PREFERRED",
          capabilityId: "cap-123",
          localFallbackAllowed: false,
        },
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
    // Unmatched requests use the default.
    expect(resolveApprovalRoute(policy, input()).ruleId).toBeUndefined()
    expect(resolveApprovalRoute(policy, input()).route).toBe("LOCAL_TUI")
  })

  test("default policies keep local TUI for LOCAL, harden HYBRID/ENTERPRISE", () => {
    const local = defaultApprovalRoutingPolicy("LOCAL")
    expect(local.defaultRoute).toBe("LOCAL_TUI")

    const hybrid = defaultApprovalRoutingPolicy("HYBRID")
    expect(hybrid.defaultRoute).toBe("LOCAL_TUI")
    expect(
      resolveApprovalRoute(hybrid, input({ riskClass: "HIGH", desktopOnline: true })).decisionSurface,
    ).toBe("DESKTOP")
    expect(
      resolveApprovalRoute(hybrid, input({ action: "deploy", desktopOnline: false })).decisionSurface,
    ).toBe("PENDING")

    const enterprise = defaultApprovalRoutingPolicy("ENTERPRISE")
    expect(enterprise.defaultRoute).toBe("CENTRAL_REQUIRED")
    expect(resolveApprovalRoute(enterprise, input()).decisionSurface).toBe("CENTRAL")
  })
})
