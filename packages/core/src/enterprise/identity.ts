/**
 * F2: Enterprise identity and access (RBAC core).
 *
 * Tenant-scoped roles, permission checks, privileged-action audit,
 * immediate deprovisioning, and visible time-bounded break-glass.
 * Every privileged action requires the appropriate role AND writes an audit
 * event; deprovisioning takes effect immediately (measured bound = 0).
 */

export type Role = "OWNER" | "ADMIN" | "OPERATOR" | "AUDITOR" | "MEMBER"

export type Permission =
  | "identity.manage"
  | "policy.publish"
  | "policy.rollback"
  | "node.manage"
  | "approval.decide"
  | "audit.read"
  | "breakglass.start"

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set([
    "identity.manage",
    "policy.publish",
    "policy.rollback",
    "node.manage",
    "approval.decide",
    "audit.read",
    "breakglass.start",
  ]),
  ADMIN: new Set([
    "identity.manage",
    "policy.publish",
    "policy.rollback",
    "node.manage",
    "approval.decide",
    "audit.read",
  ]),
  OPERATOR: new Set(["node.manage", "approval.decide", "audit.read"]),
  AUDITOR: new Set(["audit.read"]),
  MEMBER: new Set(),
}

export type RoleAssignment = {
  tenantId: string
  userId: string
  role: Role
  assignedAt: string
}

export type PrivilegedAuditEvent = {
  tenantId: string
  id: string
  actorUserId: string
  action: Permission
  resource: string
  outcome: "ALLOWED" | "DENIED"
  at: string
}

export type BreakGlassSession = {
  tenantId: string
  id: string
  actorUserId: string
  reason: string
  startedAt: string
  expiresAt: string
  active: boolean
}

export interface IdentityStore {
  assignRole(assignment: RoleAssignment): void
  revokeRole(tenantId: string, userId: string): void
  rolesFor(tenantId: string, userId: string): Role[]
  recordAudit(event: PrivilegedAuditEvent): void
  auditLog(tenantId: string): PrivilegedAuditEvent[]
  startBreakGlass(session: BreakGlassSession): void
  endBreakGlass(tenantId: string, id: string): void
  activeBreakGlass(tenantId: string): BreakGlassSession | undefined
  setUserStatus(tenantId: string, userId: string, status: "ACTIVE" | "DISABLED"): void
  isUserActive(tenantId: string, userId: string): boolean
}

export type PermissionCheck =
  | { allowed: true; role: Role }
  | { allowed: false; reason: string }

/**
 * Authenticated enterprise admin principal, resolved exclusively from the
 * server context (Basic auth username when the server requires auth, else
 * the trusted local runtime context). Client-supplied actor fields never
 * flow into this value.
 */
export type AdminPrincipal = {
  userId: string
  authenticatedAt: string
}

/**
 * Combined tenant-authority decision for enterprise admin mutations.
 *
 * The decision chain is: authenticated principal -> tenant binding -> role
 * -> permission. A principal is bound to a tenant only when the server-side
 * identity store assigns them a role there; the client cannot claim a
 * tenant or an actor. Fail closed: no role in the tenant denies the
 * mutation before any permission is consulted.
 */
export function authorizeAdminAction(
  input: {
    tenantId: string
    userId: string
    action: Permission
    active: boolean
    roles: Role[]
  },
): PermissionCheck {
  if (input.roles.length === 0) {
    return {
      allowed: false,
      reason: `principal ${input.userId} is not bound to tenant ${input.tenantId}`,
    }
  }
  return checkPermission({
    tenantId: input.tenantId,
    userId: input.userId,
    action: input.action,
    active: input.active,
    roles: input.roles,
  })
}

/**
 * Pure RBAC decision: user must be active, assigned a role in the tenant,
 * and the role must carry the permission.
 */
export function checkPermission(
  input: {
    tenantId: string
    userId: string
    action: Permission
    active: boolean
    roles: Role[]
  },
): PermissionCheck {
  if (!input.active) {
    return { allowed: false, reason: "user deprovisioned" }
  }
  const role = input.roles.find((r) => ROLE_PERMISSIONS[r].has(input.action))
  if (!role) {
    return { allowed: false, reason: `no role grants ${input.action}` }
  }
  return { allowed: true, role }
}

export function permissionsForRole(role: Role): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role]
}

export function isBreakGlassExpired(session: BreakGlassSession, now: Date): boolean {
  return new Date(session.expiresAt).getTime() <= now.getTime()
}
