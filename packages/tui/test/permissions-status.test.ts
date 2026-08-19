import { describe, expect, test } from "bun:test"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { PermissionRequest, SessionGovernanceResponse } from "@arcana/sdk/v2"
import {
  approvalActivityRow,
  approvalStateMarker,
  approvalStatusRow,
  approvalSurface,
  authorizationSummary,
  authorizationWarnings,
  expiresLabel,
  extractGuardFlags,
  guardWarnings,
  permissionRequestSummary,
  projectPermissionsStatus,
  relativeTimeLabel,
  subagentSuffix,
  waitingHint,
} from "../src/util/permissions-status"

function approval(partial: Partial<ApprovalRecord> & { approvalId: string; state: ApprovalRecord["state"] }): ApprovalRecord {
  return {
    version: 1,
    sessionId: "ses-1",
    workspaceId: "ws-1",
    requestHash: "abcdef1234567890",
    contractRevision: 3,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...partial,
  }
}

function request(permission: string, metadata: Record<string, unknown> = {}, patterns: string[] = []): PermissionRequest {
  return {
    id: `req-${permission}`,
    sessionID: "ses-1",
    permission,
    patterns,
    metadata,
    always: [],
  }
}

describe("projectPermissionsStatus", () => {
  test("keeps only PENDING approvals and all requests, totals the queue", () => {
    const status = projectPermissionsStatus({
      approvals: [
        approval({ approvalId: "a1", state: "PENDING" }),
        approval({ approvalId: "a2", state: "PENDING" }),
        approval({ approvalId: "a3", state: "CONSUMED" }),
        approval({ approvalId: "a4", state: "DENIED" }),
      ],
      requests: [request("bash"), request("read")],
    })
    expect(status.pendingApprovals.map((a) => a.approvalId)).toEqual(["a1", "a2"])
    expect(status.pendingRequests.length).toBe(2)
    expect(status.totalWaiting).toBe(4)
  })

  test("empty queues yield a zero headline", () => {
    const status = projectPermissionsStatus({ approvals: [], requests: [] })
    expect(status.totalWaiting).toBe(0)
    expect(status.pendingApprovals).toEqual([])
    expect(status.pendingRequests).toEqual([])
    expect(status.authorization).toBeNull()
    expect(status.recentActivity).toEqual([])
  })

  test("governance authorization profile is surfaced when COMPLETE", () => {
    const status = projectPermissionsStatus({
      approvals: [],
      requests: [],
      governance: governanceFixture(),
    })
    expect(status.authorization).toEqual({
      traceHealth: "COMPLETE",
      requests: 12,
      allowed: 9,
      denied: 2,
      approvalsRequired: 1,
      executed: 10,
      staleDecisions: 0,
      unauthorizedExecutions: 0,
      capabilityViolations: 0,
    })
  })

  test("an unavailable projection is fail-closed: null, never zero counts", () => {
    const status = projectPermissionsStatus({
      approvals: [],
      requests: [],
      governance: governanceFixture({ status: "UNAVAILABLE", profile: { requests: 0, allowed: 0, denied: 0 } }),
    })
    expect(status.authorization).toBeNull()
  })

  test("recent activity excludes PENDING, sorts newest first, and caps the list", () => {
    const now = Date.now()
    const status = projectPermissionsStatus({
      approvals: [
        approval({ approvalId: "old", state: "CONSUMED", updatedAt: new Date(now - 3600_000).toISOString() }),
        approval({ approvalId: "new", state: "APPROVED", updatedAt: new Date(now - 60_000).toISOString() }),
        approval({ approvalId: "mid", state: "DENIED", updatedAt: new Date(now - 120_000).toISOString() }),
        approval({ approvalId: "waiting", state: "PENDING", updatedAt: new Date(now).toISOString() }),
      ],
      requests: [],
    })
    expect(status.recentActivity.map((a) => a.approvalId)).toEqual(["new", "mid", "old"])
  })
})

describe("authorizationSummary", () => {
  test("joins the P1–P3 counters with correct plurality", () => {
    const summary = authorizationSummary({
      traceHealth: "COMPLETE",
      requests: 12,
      allowed: 9,
      denied: 2,
      approvalsRequired: 1,
      executed: 10,
      staleDecisions: 0,
      unauthorizedExecutions: 0,
      capabilityViolations: 0,
    })
    expect(summary).toBe("12 requests · 9 allowed · 2 denied · 1 approval required · 10 executed")
  })
})

describe("authorizationWarnings", () => {
  test("flags non-zero integrity counters and stays quiet otherwise", () => {
    const quiet = authorizationWarnings({
      traceHealth: "COMPLETE",
      requests: 1,
      allowed: 1,
      denied: 0,
      approvalsRequired: 0,
      executed: 1,
      staleDecisions: 0,
      unauthorizedExecutions: 0,
      capabilityViolations: 0,
    })
    expect(quiet).toEqual([])
    const loud = authorizationWarnings({
      traceHealth: "DEGRADED",
      requests: 3,
      allowed: 1,
      denied: 1,
      approvalsRequired: 1,
      executed: 1,
      staleDecisions: 2,
      unauthorizedExecutions: 1,
      capabilityViolations: 1,
    })
    expect(loud).toEqual(["2 stale decisions", "1 unauthorized execution", "1 capability violation"])
  })
})

describe("approvalStateMarker", () => {
  test("maps every approval state to a marker", () => {
    expect(approvalStateMarker("APPROVED")).toBe("✓")
    expect(approvalStateMarker("CONSUMED")).toBe("✓")
    expect(approvalStateMarker("CLAIMED")).toBe("►")
    expect(approvalStateMarker("DENIED")).toBe("✗")
    expect(approvalStateMarker("EXPIRED")).toBe("∅")
    expect(approvalStateMarker("INVALIDATED")).toBe("⊘")
    expect(approvalStateMarker("PENDING")).toBe("◤")
  })
})

describe("relativeTimeLabel", () => {
  test("renders relative past times", () => {
    const now = Date.now()
    expect(relativeTimeLabel(new Date(now - 5_000).toISOString())).toBe("just now")
    expect(relativeTimeLabel(new Date(now - 4 * 60_000).toISOString())).toBe("4m ago")
    expect(relativeTimeLabel(new Date(now - 2 * 3600_000).toISOString())).toBe("2h ago")
    expect(relativeTimeLabel(new Date(now - 3 * 86400_000).toISOString())).toBe("3d ago")
    expect(relativeTimeLabel("garbage")).toBe("recently")
  })
})

describe("approvalActivityRow", () => {
  test("shows state, truncated id, request hash, and relative time", () => {
    const row = approvalActivityRow({
      approvalId: "approval-very-long-id",
      requestHash: "0123456789abcdef",
      state: "DENIED",
      updatedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    })
    expect(row).toBe("denied approval-ve… · request 01234567 · 4m ago")
  })
})

function governanceFixture(overrides: {
  status?: "COMPLETE" | "DEGRADED" | "UNAVAILABLE"
  profile?: Partial<SessionGovernanceResponse["proof"]["authorizationProfile"]>
} = {}): SessionGovernanceResponse {
  return {
    sessionId: "ses-1",
    trace: {
      status: overrides.status ?? "COMPLETE",
      expectedCriticalEvents: 0,
      recordedCriticalEvents: 0,
      recordingErrors: [],
    },
    events: [],
    proof: {
      proofHash: "",
      runRoot: "",
      derivedAt: "",
      eventCount: 0,
      lastSequence: 0,
      proofLevel: "P0",
      traceHealth: "COMPLETE",
      integrityStatus: "UNVERIFIED",
      lifecycleStatus: "INCOMPLETE",
      assuranceProfile: { trace: "NONE", integrity: "UNVERIFIED", verification: "UNVERIFIED", reproducibility: "NONE" },
      claimsByStatus: {},
      obligationsByStatus: {},
      gaps: [],
      authorizationProfile: {
        policyVersions: [],
        requests: 12,
        allowed: 9,
        denied: 2,
        approvalsRequired: 1,
        staleDecisions: 0,
        executed: 10,
        executionFailures: 0,
        unauthorizedExecutions: 0,
        capabilityViolations: 0,
        authorizationTraceHealth: "COMPLETE",
        orphanExecutions: 0,
        unmatchedAllows: 0,
        unmatchedRequests: 0,
        intentEnforcementMode: "REQUIRED",
        intentBindingsCreated: 0,
        intentTraceHealth: "COMPLETE",
        ...overrides.profile,
      },
    },
  }
}

describe("approvalStatusRow", () => {
  test("shows truncated approval id, request hash, and relative expiry", () => {
    const row = approvalStatusRow(
      approval({ approvalId: "approval-very-long-id", state: "PENDING", requestHash: "0123456789abcdef" }),
    )
    expect(row).toContain("approval approval-very-l…")
    expect(row).toContain("request 01234567")
    expect(row).toContain("m left")
  })
})

describe("approvalSurface", () => {
  test("maps routing routes onto operator surfaces", () => {
    expect(approvalSurface("LOCAL_TUI")).toBe("spine")
    expect(approvalSurface("DESKTOP_PREFERRED")).toBe("desktop")
    expect(approvalSurface("DESKTOP_REQUIRED")).toBe("desktop")
    expect(approvalSurface("CENTRAL_REQUIRED")).toBe("central")
    expect(approvalSurface(undefined)).toBeNull()
  })

  test("approvalStatusRow names the surface when routing is known", () => {
    const bare = approvalStatusRow(approval({ approvalId: "a1", state: "PENDING" }))
    expect(bare).not.toContain("· desktop")
    const routed = approvalStatusRow(
      approval({ approvalId: "a1", state: "PENDING", route: "DESKTOP_PREFERRED" }),
    )
    expect(routed).toContain("· desktop")
    expect(approvalStatusRow(approval({ approvalId: "a1", state: "PENDING", route: "LOCAL_TUI" }))).toContain(
      "· spine",
    )
  })
})

describe("waitingHint", () => {
  test("desktop-routed approvals wait on Arcana Desktop, not the spine", () => {
    const hint = waitingHint({
      pendingApprovals: [approval({ approvalId: "a1", state: "PENDING", route: "DESKTOP_REQUIRED" })],
      pendingRequests: [],
    })
    expect(hint).toBe("Waiting for Arcana Desktop to decide these approvals.")
  })

  test("central-routed approvals wait on the central authority", () => {
    const hint = waitingHint({
      pendingApprovals: [approval({ approvalId: "a1", state: "PENDING", route: "CENTRAL_REQUIRED" })],
      pendingRequests: [],
    })
    expect(hint).toBe("Waiting for the central authority to decide these approvals.")
  })

  test("spine work keeps the spine keys hint", () => {
    expect(
      waitingHint({
        pendingApprovals: [approval({ approvalId: "a1", state: "PENDING", route: "LOCAL_TUI" })],
        pendingRequests: [],
      }),
    ).toContain("a approve once / d deny / v inspect")
    expect(
      waitingHint({ pendingApprovals: [], pendingRequests: [request("bash")] }),
    ).toContain("a approve once / d deny / v inspect")
  })

  test("mixed desktop + spine work names both surfaces", () => {
    const hint = waitingHint({
      pendingApprovals: [
        approval({ approvalId: "a1", state: "PENDING", route: "DESKTOP_PREFERRED" }),
        approval({ approvalId: "a2", state: "PENDING", route: "LOCAL_TUI" }),
      ],
      pendingRequests: [],
    })
    expect(hint).toContain("Arcana Desktop decides the desktop-routed gates")
    expect(hint).toContain("a approve once / d deny / v inspect")
  })

  test("empty queues keep the generic waiting line", () => {
    expect(waitingHint({ pendingApprovals: [], pendingRequests: [] })).toBe(
      "New gates appear here while the agent waits for your decision.",
    )
  })
})

describe("expiresLabel", () => {
  test("relative minutes and hours", () => {
    expect(expiresLabel(new Date(Date.now() + 5 * 60 * 1000).toISOString())).toBe("5m left")
    expect(expiresLabel(new Date(Date.now() + 2 * 3600 * 1000).toISOString())).toBe("2h left")
    expect(expiresLabel(new Date(Date.now() + 3 * 86400 * 1000).toISOString())).toBe("3d left")
  })

  test("past or missing expiry", () => {
    expect(expiresLabel(new Date(Date.now() - 1000).toISOString())).toBe("expired")
    expect(expiresLabel(undefined)).toBe("no expiry")
    expect(expiresLabel("garbage")).toBe("no expiry")
  })
})

describe("permissionRequestSummary", () => {
  test("bash surfaces the command", () => {
    expect(permissionRequestSummary(request("bash", { command: "git push" }))).toBe("bash · git push")
  })

  test("file paths and patterns surface per kind", () => {
    expect(permissionRequestSummary(request("read", { filePath: "/repo/src/a.ts" }))).toBe("read · /repo/src/a.ts")
    expect(permissionRequestSummary(request("edit", { filepath: "/repo/src/b.ts" }))).toBe("edit · /repo/src/b.ts")
    expect(permissionRequestSummary(request("glob", { pattern: "**/*.ts" }))).toBe("glob · **/*.ts")
    expect(permissionRequestSummary(request("grep", { pattern: "TODO" }))).toBe("grep · TODO")
    expect(permissionRequestSummary(request("list", { path: "/repo" }))).toBe("list · /repo")
  })

  test("web + task kinds", () => {
    expect(permissionRequestSummary(request("webfetch", { url: "https://example.com" }))).toBe(
      "webfetch · https://example.com",
    )
    expect(permissionRequestSummary(request("websearch", { query: "arcana docs" }))).toBe(
      "websearch · arcana docs",
    )
    expect(permissionRequestSummary(request("task", { description: "review the PR" }))).toBe("task · review the PR")
  })

  test("external directory falls back to patterns; doom_loop and unknown are static", () => {
    expect(permissionRequestSummary(request("external_directory", {}, ["/work/*"]))).toBe(
      "external directory · /work/*",
    )
    expect(permissionRequestSummary(request("external_directory", { parentDir: "/work" }))).toBe(
      "external directory · /work",
    )
    expect(permissionRequestSummary(request("doom_loop"))).toBe("continue after repeated failures")
    expect(permissionRequestSummary(request("something_else"))).toBe("something_else")
  })

  test("missing detail keeps a bare kind label", () => {
    expect(permissionRequestSummary(request("bash"))).toBe("bash")
    expect(permissionRequestSummary(request("read"))).toBe("read")
  })
})

describe("subagent attribution", () => {
  test("subagentSuffix marks child-session approvals only", () => {
    expect(subagentSuffix({})).toBe("")
    expect(subagentSuffix({ parentSessionId: "ses-parent" })).toBe(" · subagent")
  })

  test("a pending subagent approval row names its delegation", () => {
    const row = approvalStatusRow(approval({ approvalId: "a-sub", state: "PENDING", parentSessionId: "ses-parent" }))
    expect(row).toContain(" · subagent")
  })

  test("top-level approvals stay unmarked", () => {
    const row = approvalStatusRow(approval({ approvalId: "a-top", state: "PENDING" }))
    expect(row).not.toContain("subagent")
  })

  test("recent activity carries the subagent marker too", () => {
    const row = approvalActivityRow({
      approvalId: "a-sub",
      requestHash: "abcdef1234567890",
      state: "CONSUMED",
      updatedAt: new Date().toISOString(),
      parentSessionId: "ses-parent",
    })
    expect(row).toContain(" · subagent")
  })
})

describe("extractGuardFlags", () => {
  test("extracts classic guard flags", () => {
    const flags = extractGuardFlags({
      wholesale_replacement: true,
      large_change: true,
      backup_created: true,
    })
    expect(flags).toEqual({
      wholesale_replacement: true,
      large_change: true,
      backup_created: true,
      destructive_patch: undefined,
      permission_policy: undefined,
      self_awareness: undefined,
      guard_rules: undefined,
    })
  })

  test("extracts patch guard flags and rule IDs", () => {
    const flags = extractGuardFlags({
      destructive_patch: true,
      permission_policy: true,
      self_awareness: true,
      guard_rules: ["BLOCK_DELETION", "PERMISSION_POLICY_EDIT"],
    })
    expect(flags.destructive_patch).toBe(true)
    expect(flags.permission_policy).toBe(true)
    expect(flags.self_awareness).toBe(true)
    expect(flags.guard_rules).toEqual(["BLOCK_DELETION", "PERMISSION_POLICY_EDIT"])
  })
})

describe("guardWarnings", () => {
  test("renders chip labels for guard rule IDs", () => {
    const warnings = guardWarnings({
      guard_rules: ["BLOCK_DELETION", "BLOCK_INSERTION", "FILE_DELETE", "MANIFEST_EDIT"],
    })
    expect(warnings).toContain("BLOCK DELETION")
    expect(warnings).toContain("BLOCK INSERTION")
    expect(warnings).toContain("FILE DELETE")
    expect(warnings).toContain("manifest edit")
  })

  test("includes patch-level flags", () => {
    const warnings = guardWarnings({
      destructive_patch: true,
      permission_policy: true,
      self_awareness: true,
    })
    expect(warnings).toContain("destructive patch")
    expect(warnings).toContain("permission policy")
    expect(warnings).toContain("self-awareness")
  })

  test("permissionRequestSummary surfaces guard chips on edit requests", () => {
    const summary = permissionRequestSummary(request("edit", { filepath: "/repo/src/a.ts", guard_rules: ["BLOCK_DELETION"] }))
    expect(summary).toContain("edit · /repo/src/a.ts")
    expect(summary).toContain("⚠ BLOCK DELETION")
  })
})
