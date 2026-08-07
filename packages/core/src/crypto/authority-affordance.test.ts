import { describe, expect, test } from "bun:test"
import {
  deriveAuthorityAffordances,
  type AuthorityAction,
  type AuthorityAffordance,
  type AuthorityAffordanceInput,
  type AuthorityAffordanceReason,
} from "./authority-affordance"
import type { ApprovalRecord, AuthenticatedOperator } from "./approval-lifecycle"

const NOW = new Date("2026-08-05T12:00:00.000Z")

function operator(overrides: Partial<AuthenticatedOperator> = {}): AuthenticatedOperator {
  return {
    operatorId: "operator-a",
    authenticatedAt: NOW.toISOString(),
    roles: ["operator"],
    workspaceScope: ["workspace-a"],
    ...overrides,
  }
}

function record(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    approvalId: "approval-1",
    version: 7,
    sessionId: "session-a",
    workspaceId: "workspace-a",
    requestHash: "sha256:request-a",
    contractRevision: 2,
    state: "PENDING",
    route: "LOCAL_TUI",
    routingPolicyVersion: "policy-v1",
    localFallbackAllowed: true,
    riskClass: "HIGH",
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    createdAt: "2026-08-05T00:00:00.000Z",
    ...overrides,
  }
}

function input(overrides: Partial<AuthorityAffordanceInput> = {}): AuthorityAffordanceInput {
  return {
    approval: record(),
    operator: operator(),
    surface: "LOCAL_TUI",
    workspaceId: "workspace-a",
    freshness: "FRESH",
    connected: true,
    protocolCompatible: true,
    resyncRequired: false,
    desktopOnline: false,
    now: NOW,
    ...overrides,
  }
}

function affordance(list: AuthorityAffordance[], action: AuthorityAction): AuthorityAffordance {
  const found = list.find((item) => item.action === action)
  if (!found) throw new Error(`missing affordance ${action}`)
  return found
}

function stateByAction(list: AuthorityAffordance[]): Record<AuthorityAction, AuthorityAffordance["state"]> {
  return Object.fromEntries(list.map((item) => [item.action, item.state])) as Record<
    AuthorityAction,
    AuthorityAffordance["state"]
  >
}

describe("deriveAuthorityAffordances", () => {
  test("PENDING LOCAL_TUI exposes inspect/approve/deny/revoke/forensic and exact-request fields", () => {
    const list = deriveAuthorityAffordances(input())

    expect(stateByAction(list)).toEqual({
      inspect: "available",
      approve: "available",
      deny: "available",
      revoke: "available",
      retry_refresh: "completed",
      open_forensic: "available",
    })

    for (const item of list) {
      expect(item.surface).toBe("LOCAL_TUI")
      expect(item.expectedVersion).toBe(7)
      expect(item.expectedRequestHash).toBe("sha256:request-a")
      expect(item.expectedContractRevision).toBe(2)
    }

    expect(affordance(list, "approve").destructive).toBe(false)
    expect(affordance(list, "approve").requiresFreshRecord).toBe(true)
    expect(affordance(list, "deny").destructive).toBe(true)
    expect(affordance(list, "revoke").destructive).toBe(true)
    expect(affordance(list, "inspect").destructive).toBe(false)
  })

  test("DESKTOP_REQUIRED is inspect-only for LOCAL_TUI", () => {
    const list = deriveAuthorityAffordances(
      input({
        approval: record({ route: "DESKTOP_REQUIRED" }),
      }),
    )

    expect(affordance(list, "approve").state).toBe("unavailable")
    expect(affordance(list, "approve").reasonCode).toBe("ROUTE_DESKTOP_REQUIRED")
    expect(affordance(list, "deny").reasonCode).toBe("ROUTE_DESKTOP_REQUIRED")
    expect(affordance(list, "revoke").reasonCode).toBe("ROUTE_DESKTOP_REQUIRED")
    expect(affordance(list, "inspect").state).toBe("available")
  })

  test("DESKTOP_REQUIRED is available for DESKTOP only while online", () => {
    const online = deriveAuthorityAffordances(
      input({
        approval: record({ route: "DESKTOP_REQUIRED" }),
        surface: "DESKTOP",
        desktopOnline: true,
      }),
    )
    expect(affordance(online, "approve").state).toBe("available")

    const offline = deriveAuthorityAffordances(
      input({
        approval: record({ route: "DESKTOP_REQUIRED" }),
        surface: "DESKTOP",
        desktopOnline: false,
      }),
    )
    expect(affordance(offline, "approve").state).toBe("unavailable")
    expect(affordance(offline, "approve").reasonCode).toBe("OFFLINE")
  })

  test("CENTRAL_REQUIRED is inspect-only locally and decidable by CONTROL", () => {
    const local = deriveAuthorityAffordances(
      input({ approval: record({ route: "CENTRAL_REQUIRED" }) }),
    )
    expect(affordance(local, "approve").reasonCode).toBe("ROUTE_CENTRAL_REQUIRED")
    expect(affordance(local, "inspect").state).toBe("available")

    const control = deriveAuthorityAffordances(
      input({
        approval: record({ route: "CENTRAL_REQUIRED" }),
        surface: "CONTROL",
      }),
    )
    expect(affordance(control, "approve").state).toBe("available")
  })

  test("DESKTOP_PREFERRED falls back to LOCAL_TUI only offline and only when policy permits", () => {
    const approval = record({ route: "DESKTOP_PREFERRED" })

    const desktopOnline = deriveAuthorityAffordances(input({ approval, desktopOnline: true }))
    expect(affordance(desktopOnline, "approve").state).toBe("unavailable")
    expect(affordance(desktopOnline, "approve").reasonCode).toBe("ROUTE_DESKTOP_REQUIRED")

    const fallback = deriveAuthorityAffordances(input({ approval, desktopOnline: false }))
    expect(affordance(fallback, "approve").state).toBe("available")

    const noFallback = deriveAuthorityAffordances(
      input({ approval: record({ route: "DESKTOP_PREFERRED", localFallbackAllowed: false }), desktopOnline: false }),
    )
    expect(affordance(noFallback, "approve").state).toBe("unavailable")
    expect(affordance(noFallback, "approve").reasonCode).toBe("LOCAL_FALLBACK_NOT_ALLOWED")

    const desktop = deriveAuthorityAffordances(
      input({ approval, surface: "DESKTOP", desktopOnline: true }),
    )
    expect(affordance(desktop, "approve").state).toBe("available")
  })

  test("offline/stale/resync/protocol mismatch make decisions unavailable and refresh available", () => {
    const cases: Array<Partial<AuthorityAffordanceInput> & { reason: AuthorityAffordanceReason }> = [
      { connected: false, reason: "OFFLINE" },
      { protocolCompatible: false, reason: "PROTOCOL_MISMATCH" },
      { resyncRequired: true, reason: "RESYNC_REQUIRED" },
      { freshness: "STALE", reason: "STALE_RECORD" },
      { freshness: "UNKNOWN", reason: "UNKNOWN_RUNTIME_STATE" },
    ]

    for (const overrides of cases) {
      const list = deriveAuthorityAffordances(input(overrides))
      expect(affordance(list, "approve").state).toBe("unavailable")
      expect(affordance(list, "approve").reasonCode).toBe(overrides.reason)
      expect(affordance(list, "deny").reasonCode).toBe(overrides.reason)
      expect(affordance(list, "revoke").reasonCode).toBe(overrides.reason)
      expect(affordance(list, "retry_refresh").state).toBe("available")
      expect(affordance(list, "inspect").state).toBe("available")
      expect(affordance(list, "open_forensic").state).toBe("available")
    }
  })

  test("viewed exact-request mismatch maps to stale/request/contract reason codes", () => {
    const staleVersion = deriveAuthorityAffordances(
      input({ viewed: { expectedVersion: 6, expectedRequestHash: "sha256:request-a", expectedContractRevision: 2 } }),
    )
    expect(affordance(staleVersion, "approve").reasonCode).toBe("STALE_RECORD")

    const changedHash = deriveAuthorityAffordances(
      input({ viewed: { expectedVersion: 7, expectedRequestHash: "sha256:changed", expectedContractRevision: 2 } }),
    )
    expect(affordance(changedHash, "approve").reasonCode).toBe("REQUEST_CHANGED")

    const changedRevision = deriveAuthorityAffordances(
      input({ viewed: { expectedVersion: 7, expectedRequestHash: "sha256:request-a", expectedContractRevision: 1 } }),
    )
    expect(affordance(changedRevision, "approve").reasonCode).toBe("CONTRACT_REVISION_CHANGED")
  })

  test("expired approvals disable decisions with APPROVAL_EXPIRED", () => {
    const list = deriveAuthorityAffordances(
      input({ approval: record({ expiresAt: "2020-01-01T00:00:00.000Z" }) }),
    )
    expect(affordance(list, "approve").state).toBe("unavailable")
    expect(affordance(list, "approve").reasonCode).toBe("APPROVAL_EXPIRED")
    expect(affordance(list, "deny").reasonCode).toBe("APPROVAL_EXPIRED")
    expect(affordance(list, "revoke").reasonCode).toBe("APPROVAL_EXPIRED")
  })

  test("completed states are rendered without optimistic availability", () => {
    const approved = deriveAuthorityAffordances(input({ approval: record({ state: "APPROVED" }) }))
    expect(affordance(approved, "approve").state).toBe("completed")
    expect(affordance(approved, "deny").state).toBe("unavailable")
    expect(affordance(approved, "deny").reasonCode).toBe("ALREADY_DECIDED")
    expect(affordance(approved, "revoke").state).toBe("available")

    const denied = deriveAuthorityAffordances(input({ approval: record({ state: "DENIED" }) }))
    expect(affordance(denied, "deny").state).toBe("completed")
    expect(affordance(denied, "approve").reasonCode).toBe("ALREADY_DECIDED")
    expect(affordance(denied, "revoke").reasonCode).toBe("ALREADY_DECIDED")

    const invalidated = deriveAuthorityAffordances(input({ approval: record({ state: "INVALIDATED" }) }))
    expect(affordance(invalidated, "revoke").state).toBe("completed")
    expect(affordance(invalidated, "approve").reasonCode).toBe("APPROVAL_REVOKED")

    const claimed = deriveAuthorityAffordances(input({ approval: record({ state: "CLAIMED" }) }))
    expect(affordance(claimed, "approve").state).toBe("completed")
    expect(affordance(claimed, "revoke").reasonCode).toBe("ALREADY_CLAIMED")

    const consumed = deriveAuthorityAffordances(input({ approval: record({ state: "CONSUMED" }) }))
    expect(affordance(consumed, "approve").state).toBe("completed")
    expect(affordance(consumed, "deny").reasonCode).toBe("ALREADY_CONSUMED")
    expect(affordance(consumed, "revoke").reasonCode).toBe("ALREADY_CONSUMED")
  })

  test("in-flight actions stay in_flight", () => {
    const list = deriveAuthorityAffordances(input({ inFlight: ["approve", "retry_refresh"] }))
    expect(affordance(list, "approve").state).toBe("in_flight")
    expect(affordance(list, "deny").state).toBe("available")
    expect(affordance(list, "retry_refresh").state).toBe("in_flight")
  })

  test("session/workspace/operator scope isolation fails closed", () => {
    const wrongSession = deriveAuthorityAffordances(
      input({ sessionRestriction: "session-b" }),
    )
    expect(affordance(wrongSession, "approve").reasonCode).toBe("SESSION_RESTRICTION")

    const wrongWorkspace = deriveAuthorityAffordances(input({ workspaceId: "workspace-b" }))
    expect(affordance(wrongWorkspace, "approve").reasonCode).toBe("WORKSPACE_MISMATCH")

    const wrongScope = deriveAuthorityAffordances(
      input({ operator: operator({ workspaceScope: ["workspace-b"] }) }),
    )
    expect(affordance(wrongScope, "approve").reasonCode).toBe("SURFACE_NOT_AUTHORIZED")

    const unauthenticated = deriveAuthorityAffordances(input({ operator: operator({ operatorId: "" }) }))
    expect(affordance(unauthenticated, "approve").reasonCode).toBe("AUTHENTICATION_REQUIRED")
  })

  test("capability/policy/evidence failures fail closed", () => {
    const capability = deriveAuthorityAffordances(input({ capabilityValid: false }))
    expect(affordance(capability, "approve").reasonCode).toBe("CAPABILITY_REVOKED")

    const policy = deriveAuthorityAffordances(input({ policyCompatible: false }))
    expect(affordance(policy, "approve").reasonCode).toBe("POLICY_CHANGED")

    const evidence = deriveAuthorityAffordances(input({ evidenceDegraded: true }))
    expect(affordance(evidence, "open_forensic").reasonCode).toBe("EVIDENCE_DEGRADED")
    expect(affordance(evidence, "retry_refresh").state).toBe("available")
  })

  test("unknown desktop liveness for desktop routes is never optimistic", () => {
    const list = deriveAuthorityAffordances(
      input({
        approval: record({ route: "DESKTOP_PREFERRED" }),
        desktopOnline: undefined,
      }),
    )
    expect(affordance(list, "approve").state).toBe("unavailable")
    expect(affordance(list, "approve").reasonCode).toBe("UNKNOWN_RUNTIME_STATE")
  })
})
