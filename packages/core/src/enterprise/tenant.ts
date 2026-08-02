/**
 * F1: Multi-tenant organization model.
 *
 * Every record is tenant-scoped. The store interface forces callers to
 * address a tenant ID on every read/write, and the SQLite implementation
 * filters by tenant_id in every query — cross-tenant access is structurally
 * impossible rather than policy-adjacent.
 */

export type TenantId = string

export type Organization = {
  tenantId: TenantId
  id: string
  name: string
  createdAt: string
}

export type TenantScopedRecord =
  | {
      kind: "workspace"
      tenantId: TenantId
      id: string
      organizationId: string
      path: string
    }
  | {
      kind: "environment"
      tenantId: TenantId
      id: string
      organizationId: string
      name: string
    }
  | {
      kind: "team"
      tenantId: TenantId
      id: string
      organizationId: string
      name: string
    }
  | {
      kind: "user"
      tenantId: TenantId
      id: string
      organizationId: string
      email: string
      status: "ACTIVE" | "DISABLED"
    }
  | {
      kind: "service_principal"
      tenantId: TenantId
      id: string
      organizationId: string
      name: string
    }
  | {
      kind: "agent_principal"
      tenantId: TenantId
      id: string
      organizationId: string
      principalId: string
    }
  | {
      kind: "node"
      tenantId: TenantId
      id: string
      organizationId: string
      nodeId: string
    }
  | {
      kind: "policy_bundle"
      tenantId: TenantId
      id: string
      organizationId: string
      policyId: string
      version: string
    }
  | {
      kind: "approval_queue"
      tenantId: TenantId
      id: string
      organizationId: string
      name: string
    }
  | {
      kind: "proof_archive"
      tenantId: TenantId
      id: string
      organizationId: string
      range: { from: number; to: number }
    }

export interface TenantStore {
  putOrganization(org: Organization): void
  getOrganization(tenantId: TenantId): Organization | undefined
  putRecord(record: TenantScopedRecord): void
  listRecords(tenantId: TenantId, kind: TenantScopedRecord["kind"]): TenantScopedRecord[]
  getRecord(tenantId: TenantId, kind: TenantScopedRecord["kind"], id: string): TenantScopedRecord | undefined
  deleteTenant(tenantId: TenantId): { removedOrganizations: number; removedRecords: number }
}

/**
 * Pure guard used by callers and tests: a record may only be accessed through
 * its own tenant. Returns the record only when the requested tenant matches.
 */
export function withTenantAccess<T extends { tenantId: TenantId }>(
  tenantId: TenantId,
  record: T | undefined,
): T | undefined {
  if (!record) return undefined
  return record.tenantId === tenantId ? record : undefined
}
