import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/api/enterprise"

export const OrganizationSchema = Schema.Struct({
  tenantId: Schema.String,
  id: Schema.String,
  name: Schema.String,
  createdAt: Schema.String,
})

export const FleetSummarySchema = Schema.Struct({
  nodeId: Schema.String,
  health: Schema.Literals(["UNKNOWN", "HEALTHY", "STALE", "REVOKED", "QUARANTINED"]),
  version: Schema.String,
  enforcementMode: Schema.String,
  proofBacklog: Schema.Number,
  lastSeenAt: Schema.optional(Schema.String),
})

export const ApprovalDecisionResponseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("DECIDED"), status: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const AuditEventSchema = Schema.Struct({
  id: Schema.String,
  actorUserId: Schema.String,
  action: Schema.String,
  resource: Schema.String,
  outcome: Schema.String,
  at: Schema.String,
})

export const EnterprisePaths = {
  createOrganization: `${root}/organizations`,
  assignRole: `${root}/organizations/:tenantId/roles`,
  fleet: `${root}/organizations/:tenantId/fleet`,
  createApproval: `${root}/organizations/:tenantId/approvals`,
  decideApproval: `${root}/organizations/:tenantId/approvals/:approvalId/decide`,
  audit: `${root}/organizations/:tenantId/audit`,
} as const

export const EnterpriseApi = HttpApi.make("enterprise").add(
  HttpApiGroup.make("enterprise")
    .add(
      HttpApiEndpoint.post("createOrganization", EnterprisePaths.createOrganization, {
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({ tenantId: Schema.String, name: Schema.String }),
        success: described(OrganizationSchema, "Created organization"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.createOrganization",
          summary: "Create a tenant organization (F1)",
        }),
      ),
      HttpApiEndpoint.post("assignRole", EnterprisePaths.assignRole, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          userId: Schema.String,
          role: Schema.Literals(["OWNER", "ADMIN", "OPERATOR", "AUDITOR", "MEMBER"]),
        }),
        success: described(Schema.Boolean, "Role assigned"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.assignRole",
          summary: "Assign a tenant role (F2)",
        }),
      ),
      HttpApiEndpoint.get("fleet", EnterprisePaths.fleet, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(Schema.Array(FleetSummarySchema), "Fleet summary (F4)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.fleet",
          summary: "List fleet nodes with derived health (F4)",
        }),
      ),
      HttpApiEndpoint.post("createApproval", EnterprisePaths.createApproval, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          approvalId: Schema.String,
          requestHash: Schema.String,
          requesterId: Schema.String,
          exactRequestJson: Schema.String,
          expiresAt: Schema.String,
        }),
        success: described(Schema.Boolean, "Approval queued (F5)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.createApproval",
          summary: "Queue a central approval (F5)",
        }),
      ),
      HttpApiEndpoint.post("decideApproval", EnterprisePaths.decideApproval, {
        params: { tenantId: Schema.String, approvalId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          actorUserId: Schema.String,
          decision: Schema.Literals(["APPROVE", "DENY"]),
          inspectedRequestJson: Schema.optional(Schema.String),
        }),
        success: described(ApprovalDecisionResponseSchema, "Approval decision result"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.decideApproval",
          summary: "Decide a central approval with exact inspection (F5)",
        }),
      ),
      HttpApiEndpoint.get("audit", EnterprisePaths.audit, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(Schema.Array(AuditEventSchema), "Privileged audit log (F2)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.audit",
          summary: "List privileged audit events for a tenant (F2)",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "enterprise", description: "Enterprise admin surface (F1-F6, F11)." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
