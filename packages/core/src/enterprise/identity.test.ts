/**
 * F2: identity/RBAC tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteIdentityStore } from "./identity-sqlite"
import {
  checkPermission,
  isBreakGlassExpired,
  type BreakGlassSession,
  type PrivilegedAuditEvent,
} from "./identity"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function store(): SqliteIdentityStore {
  return new SqliteIdentityStore(new Database(":memory:"))
}

function audit(tenantId: string, id: string, outcome: PrivilegedAuditEvent["outcome"]): PrivilegedAuditEvent {
  return {
    tenantId,
    id,
    actorUserId: "u-admin",
    action: "policy.publish",
    resource: "policy-1",
    outcome,
    at: NOW.toISOString(),
  }
}

describe("F2 RBAC", () => {
  it("enforces the role permission matrix", () => {
    expect(
      checkPermission({ tenantId: "t", userId: "u", action: "policy.publish", active: true, roles: ["OWNER"] }).allowed,
    ).toBe(true)
    expect(
      checkPermission({ tenantId: "t", userId: "u", action: "policy.publish", active: true, roles: ["OPERATOR"] })
        .allowed,
    ).toBe(false)
    expect(
      checkPermission({ tenantId: "t", userId: "u", action: "audit.read", active: true, roles: ["AUDITOR"] }).allowed,
    ).toBe(true)
    expect(
      checkPermission({ tenantId: "t", userId: "u", action: "node.manage", active: true, roles: ["MEMBER"] }).allowed,
    ).toBe(false)
  })

  it("roles are tenant-scoped", () => {
    const s = store()
    s.assignRole({ tenantId: "tenant-a", userId: "u", role: "ADMIN", assignedAt: NOW.toISOString() })
    expect(s.rolesFor("tenant-a", "u")).toEqual(["ADMIN"])
    expect(s.rolesFor("tenant-b", "u")).toEqual([])
  })

  it("deprovisioning removes access immediately", () => {
    const s = store()
    s.setUserStatus("tenant-a", "u", "ACTIVE")
    s.assignRole({ tenantId: "tenant-a", userId: "u", role: "ADMIN", assignedAt: NOW.toISOString() })
    expect(
      checkPermission({ tenantId: "tenant-a", userId: "u", action: "policy.publish", active: s.isUserActive("tenant-a", "u"), roles: s.rolesFor("tenant-a", "u") }).allowed,
    ).toBe(true)

    s.setUserStatus("tenant-a", "u", "DISABLED")
    expect(
      checkPermission({ tenantId: "tenant-a", userId: "u", action: "policy.publish", active: s.isUserActive("tenant-a", "u"), roles: s.rolesFor("tenant-a", "u") }).allowed,
    ).toBe(false)
  })

  it("audits privileged actions per tenant", () => {
    const s = store()
    s.recordAudit(audit("tenant-a", "evt-1", "ALLOWED"))
    s.recordAudit(audit("tenant-b", "evt-2", "DENIED"))
    expect(s.auditLog("tenant-a").map((e) => e.id)).toEqual(["evt-1"])
    expect(s.auditLog("tenant-b").map((e) => e.id)).toEqual(["evt-2"])
  })

  it("break-glass is visible, time-bounded, and ends explicitly", () => {
    const s = store()
    const session: BreakGlassSession = {
      tenantId: "tenant-a",
      id: "bg-1",
      actorUserId: "u-admin",
      reason: "outage",
      startedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000).toISOString(),
      active: true,
    }
    s.startBreakGlass(session)
    expect(s.activeBreakGlass("tenant-a")?.id).toBe("bg-1")
    expect(isBreakGlassExpired(session, NOW)).toBe(false)
    expect(isBreakGlassExpired(session, new Date(NOW.getTime() + 31 * 60 * 1000))).toBe(true)

    s.endBreakGlass("tenant-a", "bg-1")
    expect(s.activeBreakGlass("tenant-a")).toBeUndefined()
  })
})
