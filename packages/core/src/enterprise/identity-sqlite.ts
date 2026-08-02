/**
 * F2: SQLite identity/RBAC store (tenant-scoped).
 */

import { Database } from "bun:sqlite"
import type {
  BreakGlassSession,
  IdentityStore,
  PrivilegedAuditEvent,
  Role,
  RoleAssignment,
} from "./identity"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tenant_identity_roles (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS tenant_identity_status (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS tenant_privileged_audit (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  outcome TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS tenant_breakglass (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  active INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
`

export class SqliteIdentityStore implements IdentityStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  assignRole(assignment: RoleAssignment): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO tenant_identity_roles (tenant_id, user_id, role, assigned_at)
         VALUES ($tenantId, $userId, $role, $assignedAt)`,
      )
      .run({
        $tenantId: assignment.tenantId,
        $userId: assignment.userId,
        $role: assignment.role,
        $assignedAt: assignment.assignedAt,
      })
  }

  revokeRole(tenantId: string, userId: string): void {
    this.db
      .query(`DELETE FROM tenant_identity_roles WHERE tenant_id = $tenantId AND user_id = $userId`)
      .run({ $tenantId: tenantId, $userId: userId })
  }

  rolesFor(tenantId: string, userId: string): Role[] {
    const rows = this.db
      .query(
        `SELECT role FROM tenant_identity_roles
         WHERE tenant_id = $tenantId AND user_id = $userId`,
      )
      .all({ $tenantId: tenantId, $userId: userId }) as unknown as Array<{ role: string }>
    return rows.map((row) => row.role as Role)
  }

  recordAudit(event: PrivilegedAuditEvent): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO tenant_privileged_audit (
          tenant_id, id, actor_user_id, action, resource, outcome, at
        ) VALUES ($tenantId, $id, $actorUserId, $action, $resource, $outcome, $at)`,
      )
      .run({
        $tenantId: event.tenantId,
        $id: event.id,
        $actorUserId: event.actorUserId,
        $action: event.action,
        $resource: event.resource,
        $outcome: event.outcome,
        $at: event.at,
      })
  }

  auditLog(tenantId: string): PrivilegedAuditEvent[] {
    const rows = this.db
      .query(
        `SELECT * FROM tenant_privileged_audit WHERE tenant_id = $tenantId ORDER BY at ASC`,
      )
      .all({ $tenantId: tenantId }) as unknown as Array<{
      id: string
      actor_user_id: string
      action: string
      resource: string
      outcome: string
      at: string
    }>
    return rows.map((row) => ({
      tenantId,
      id: row.id,
      actorUserId: row.actor_user_id,
      action: row.action as PrivilegedAuditEvent["action"],
      resource: row.resource,
      outcome: row.outcome as PrivilegedAuditEvent["outcome"],
      at: row.at,
    }))
  }

  startBreakGlass(session: BreakGlassSession): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO tenant_breakglass (
          tenant_id, id, actor_user_id, reason, started_at, expires_at, active
        ) VALUES ($tenantId, $id, $actorUserId, $reason, $startedAt, $expiresAt, 1)`,
      )
      .run({
        $tenantId: session.tenantId,
        $id: session.id,
        $actorUserId: session.actorUserId,
        $reason: session.reason,
        $startedAt: session.startedAt,
        $expiresAt: session.expiresAt,
      })
  }

  endBreakGlass(tenantId: string, id: string): void {
    this.db
      .query(
        `UPDATE tenant_breakglass SET active = 0
         WHERE tenant_id = $tenantId AND id = $id`,
      )
      .run({ $tenantId: tenantId, $id: id })
  }

  activeBreakGlass(tenantId: string): BreakGlassSession | undefined {
    const row = this.db
      .query(
        `SELECT * FROM tenant_breakglass
         WHERE tenant_id = $tenantId AND active = 1
         ORDER BY started_at DESC LIMIT 1`,
      )
      .get({ $tenantId: tenantId }) as
      | {
          id: string
          actor_user_id: string
          reason: string
          started_at: string
          expires_at: string
        }
      | null
    return row
      ? {
          tenantId,
          id: row.id,
          actorUserId: row.actor_user_id,
          reason: row.reason,
          startedAt: row.started_at,
          expiresAt: row.expires_at,
          active: true,
        }
      : undefined
  }

  setUserStatus(tenantId: string, userId: string, status: "ACTIVE" | "DISABLED"): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO tenant_identity_status (tenant_id, user_id, status)
         VALUES ($tenantId, $userId, $status)`,
      )
      .run({ $tenantId: tenantId, $userId: userId, $status: status })
  }

  isUserActive(tenantId: string, userId: string): boolean {
    const row = this.db
      .query(
        `SELECT status FROM tenant_identity_status
         WHERE tenant_id = $tenantId AND user_id = $userId`,
      )
      .get({ $tenantId: tenantId, $userId: userId }) as { status: string } | null
    // Default: active unless explicitly disabled.
    return row === null || row.status === "ACTIVE"
  }
}
