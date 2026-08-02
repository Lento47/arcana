/**
 * F1: multi-tenant isolation tests.
 */

import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { SqliteTenantStore } from "./tenant-sqlite"
import { withTenantAccess, type Organization, type TenantScopedRecord } from "./tenant"

const NOW = "2026-08-02T12:00:00.000Z"

function org(tenantId: string, name: string): Organization {
  return { tenantId, id: `org-${tenantId}`, name, createdAt: NOW }
}

function record(tenantId: string, kind: TenantScopedRecord["kind"], id: string): TenantScopedRecord {
  switch (kind) {
    case "workspace":
      return { kind, tenantId, id, organizationId: `org-${tenantId}`, path: `/ws/${id}` }
    case "user":
      return { kind, tenantId, id, organizationId: `org-${tenantId}`, email: `${id}@example.com`, status: "ACTIVE" }
    case "node":
      return { kind, tenantId, id, organizationId: `org-${tenantId}`, nodeId: id }
    case "policy_bundle":
      return { kind, tenantId, id, organizationId: `org-${tenantId}`, policyId: id, version: "1.0" }
    case "approval_queue":
      return { kind, tenantId, id, organizationId: `org-${tenantId}`, name: id }
    case "proof_archive":
      return { kind, tenantId, id, organizationId: `org-${tenantId}`, range: { from: 1, to: 10 } }
    default:
      return { kind, tenantId, id, organizationId: `org-${tenantId}`, name: id } as TenantScopedRecord
  }
}

describe("F1 multi-tenant isolation", () => {
  it("scopes every record to its tenant with zero cross-tenant reads", () => {
    const store = new SqliteTenantStore(new Database(":memory:"))
    store.putOrganization(org("tenant-a", "Acme"))
    store.putOrganization(org("tenant-b", "Globex"))

    for (const kind of ["workspace", "user", "node", "policy_bundle", "approval_queue", "proof_archive"] as const) {
      store.putRecord(record("tenant-a", kind, `${kind}-a`))
      store.putRecord(record("tenant-b", kind, `${kind}-b`))
    }

    // Tenant B sees exactly its own records.
    expect(store.listRecords("tenant-b", "workspace").map((r) => r.id)).toEqual(["workspace-b"])
    expect(store.listRecords("tenant-a", "node").map((r) => r.id)).toEqual(["node-a"])

    // Cross-tenant direct reads return nothing.
    expect(store.getRecord("tenant-a", "user", "user-b")).toBeUndefined()
    expect(store.getRecord("tenant-b", "proof_archive", "proof_archive-a")).toBeUndefined()

    // Pure access guard agrees.
    const leaked = store.getRecord("tenant-b", "workspace", "workspace-a")
    expect(withTenantAccess("tenant-a", leaked)).toBeUndefined()
  })

  it("tenant deletion removes only that tenant's records", () => {
    const store = new SqliteTenantStore(new Database(":memory:"))
    store.putOrganization(org("tenant-a", "Acme"))
    store.putOrganization(org("tenant-b", "Globex"))
    store.putRecord(record("tenant-a", "workspace", "ws-a"))
    store.putRecord(record("tenant-b", "workspace", "ws-b"))
    store.putRecord(record("tenant-b", "user", "u-b"))

    const result = store.deleteTenant("tenant-a")
    expect(result.removedOrganizations).toBe(1)
    expect(result.removedRecords).toBe(1)

    expect(store.getOrganization("tenant-a")).toBeUndefined()
    expect(store.listRecords("tenant-a", "workspace")).toHaveLength(0)
    expect(store.listRecords("tenant-b", "workspace")).toHaveLength(1)
    expect(store.getRecord("tenant-b", "user", "u-b")).toBeDefined()
  })

  it("survives restart with the same isolation", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-tenant-"))
    try {
      const dbPath = join(dir, "tenant.db")
      const db1 = new Database(dbPath)
      const store1 = new SqliteTenantStore(db1)
      store1.putOrganization(org("tenant-a", "Acme"))
      store1.putRecord(record("tenant-a", "node", "node-a"))
      db1.close()

      const db2 = new Database(dbPath)
      const store2 = new SqliteTenantStore(db2)
      expect(store2.getOrganization("tenant-a")?.name).toBe("Acme")
      expect(store2.getRecord("tenant-b", "node", "node-a")).toBeUndefined()
      expect(store2.listRecords("tenant-a", "node")).toHaveLength(1)
      db2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
