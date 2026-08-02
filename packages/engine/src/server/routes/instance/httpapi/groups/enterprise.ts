import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"
import { PolicyBundleRecordSchema } from "./policy"

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

export const PolicyPromotionResponseSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("PROMOTED"),
    record: PolicyBundleRecordSchema,
    promotionId: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const PolicyDiffSchema = Schema.Struct({
  sequenceChanged: Schema.Boolean,
  versionChanged: Schema.Boolean,
  digestChanged: Schema.Boolean,
  activationChanged: Schema.Boolean,
  previousDigestChanged: Schema.Boolean,
  changes: Schema.Array(Schema.String),
})

export const FleetRegistrationSchema = Schema.Struct({
  nodeId: Schema.String,
  organizationId: Schema.String,
  environment: Schema.String,
  version: Schema.String,
  upgradeRing: Schema.Number,
  nodeKeyEpoch: Schema.Number,
  enforcementMode: Schema.Literals(["ONLINE", "OFFLINE_RESTRICTED", "OFFLINE_READ_ONLY", "QUARANTINED"]),
  policySequence: Schema.Number,
  policyDigest: Schema.String,
  revocationSequence: Schema.Number,
  revocationDigest: Schema.String,
  proofBacklog: Schema.Number,
  registeredAt: Schema.optional(Schema.String),
})

export const FleetHeartbeatSchema = Schema.Struct({
  enforcementMode: Schema.optional(
    Schema.Literals(["ONLINE", "OFFLINE_RESTRICTED", "OFFLINE_READ_ONLY", "QUARANTINED"]),
  ),
  policySequence: Schema.optional(Schema.Number),
  policyDigest: Schema.optional(Schema.String),
  revocationSequence: Schema.optional(Schema.Number),
  revocationDigest: Schema.optional(Schema.String),
  proofBacklog: Schema.optional(Schema.Number),
  lastSyncAt: Schema.optional(Schema.String),
})

export const OkResponseSchema = Schema.Struct({ ok: Schema.Boolean })

export const SecurityAlertSchema = Schema.Struct({
  tenantId: Schema.String,
  alertId: Schema.String,
  severity: Schema.Literals(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  kind: Schema.String,
  subjectId: Schema.optional(Schema.String),
  detail: Schema.String,
  at: Schema.String,
})

export const IncidentTimelineEventSchema = Schema.Struct({
  tenantId: Schema.String,
  incidentId: Schema.String,
  at: Schema.String,
  actor: Schema.String,
  event: Schema.String,
})

export const RevocationCampaignResponseSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("RUN"),
    revokedNodes: Schema.Array(Schema.String),
    auditEvents: Schema.Array(
      Schema.Struct({ nodeId: Schema.String, at: Schema.String, reason: Schema.String }),
    ),
  }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const ForensicExportSchema = Schema.Struct({
  tenantId: Schema.String,
  exportedAt: Schema.String,
  alerts: Schema.Array(SecurityAlertSchema),
  timeline: Schema.Array(IncidentTimelineEventSchema),
})

export const CustodyEventSchema = Schema.Struct({
  who: Schema.String,
  action: Schema.String,
  at: Schema.String,
})

export const ArchiveRecordSchema = Schema.Struct({
  tenantId: Schema.String,
  archiveId: Schema.String,
  proofId: Schema.String,
  proofJson: Schema.String,
  fingerprint: Schema.String,
  source: Schema.String,
  ingestedAt: Schema.String,
  retentionUntil: Schema.String,
  legalHold: Schema.Boolean,
  custody: Schema.Array(CustodyEventSchema),
})

export const ArchiveResponseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("ARCHIVED"), record: ArchiveRecordSchema }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const ArchiveExportResponseSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("EXPORTED"),
    proofJson: Schema.String,
    fingerprint: Schema.String,
    custody: Schema.Array(CustodyEventSchema),
  }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const LegalHoldResponseSchema = Schema.Struct({
  ok: Schema.Boolean,
  reason: Schema.optional(Schema.String),
})

export const RetentionSweepResponseSchema = Schema.Struct({
  deleted: Schema.Number,
  retainedByHold: Schema.Number,
})

export const DataGovernancePolicySchema = Schema.Struct({
  allowedRegions: Schema.Array(Schema.String),
  customerManagedKeys: Schema.Boolean,
  telemetryOptOut: Schema.Boolean,
  piiRetentionMs: Schema.Number,
})

export const DataRecordSchema = Schema.Struct({
  id: Schema.String,
  classification: Schema.Literals(["PUBLIC", "INTERNAL", "PRIVATE", "SECRET", "PII"]),
  region: Schema.String,
  createdAt: Schema.String,
})

export const GovernanceCheckSchema = Schema.Union([
  Schema.Struct({ allowed: Schema.Literal(true), reason: Schema.String }),
  Schema.Struct({ allowed: Schema.Literal(false), reason: Schema.String }),
])

export const ClassifyResponseSchema = Schema.Struct({
  classification: Schema.Literals(["PUBLIC", "INTERNAL", "PRIVATE", "SECRET", "PII"]),
})

export const PiiRetentionResponseSchema = Schema.Struct({
  retained: Schema.Array(DataRecordSchema),
  expired: Schema.Array(Schema.String),
})

export const AlertsQuery = Schema.Struct({
  ...WorkspaceRoutingQuery.fields,
  severity: Schema.optional(Schema.Literals(["LOW", "MEDIUM", "HIGH", "CRITICAL"])),
})

export const EnterprisePaths = {
  createOrganization: `${root}/organizations`,
  assignRole: `${root}/organizations/:tenantId/roles`,
  fleet: `${root}/organizations/:tenantId/fleet`,
  createApproval: `${root}/organizations/:tenantId/approvals`,
  decideApproval: `${root}/organizations/:tenantId/approvals/:approvalId/decide`,
  audit: `${root}/organizations/:tenantId/audit`,
  registerNode: `${root}/organizations/:tenantId/fleet/register`,
  heartbeat: `${root}/organizations/:tenantId/fleet/:nodeId/heartbeat`,
  promotePolicy: `${root}/organizations/:tenantId/policies/promote`,
  diffPolicy: `${root}/organizations/:tenantId/policies/diff`,
  revokeApproval: `${root}/organizations/:tenantId/approvals/revoke`,
  bulkDenyApprovals: `${root}/organizations/:tenantId/approvals/bulk-deny`,
  archiveProof: `${root}/organizations/:tenantId/audit-archive`,
  exportArchive: `${root}/organizations/:tenantId/audit-archive/:archiveId/export`,
  custody: `${root}/organizations/:tenantId/audit-archive/:archiveId/custody`,
  legalHold: `${root}/organizations/:tenantId/audit-archive/:archiveId/legal-hold`,
  retentionSweep: `${root}/organizations/:tenantId/audit-archive/retention-sweep`,
  alerts: `${root}/organizations/:tenantId/alerts`,
  incidentTimeline: `${root}/organizations/:tenantId/incidents/:incidentId/timeline`,
  revocationCampaign: `${root}/organizations/:tenantId/revocation-campaigns`,
  forensicExport: `${root}/organizations/:tenantId/forensic-export`,
  checkStorable: `${root}/organizations/:tenantId/governance/check-storable`,
  checkExportable: `${root}/organizations/:tenantId/governance/check-exportable`,
  classify: `${root}/organizations/:tenantId/governance/classify`,
  piiRetention: `${root}/organizations/:tenantId/governance/pii-retention`,
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
      HttpApiEndpoint.post("registerNode", EnterprisePaths.registerNode, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: FleetRegistrationSchema,
        success: described(OkResponseSchema, "Fleet node registered (F4)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.registerNode",
          summary: "Register a fleet node (F4)",
        }),
      ),
      HttpApiEndpoint.post("heartbeat", EnterprisePaths.heartbeat, {
        params: { tenantId: Schema.String, nodeId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: FleetHeartbeatSchema,
        success: described(OkResponseSchema, "Fleet heartbeat recorded (F4)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.heartbeat",
          summary: "Record a fleet node heartbeat (F4)",
        }),
      ),
      HttpApiEndpoint.post("promotePolicy", EnterprisePaths.promotePolicy, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          sourceSequence: Schema.Number,
          targetEnvironment: Schema.String,
          requestedBy: Schema.String,
          approvedBy: Schema.String,
          activationTime: Schema.optional(Schema.String),
        }),
        success: described(PolicyPromotionResponseSchema, "Policy promotion result (F3)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.promotePolicy",
          summary: "Promote a signed policy bundle across environments (F3)",
        }),
      ),
      HttpApiEndpoint.post("diffPolicy", EnterprisePaths.diffPolicy, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          beforeSequence: Schema.optional(Schema.Number),
          afterSequence: Schema.optional(Schema.Number),
        }),
        success: described(PolicyDiffSchema, "Policy bundle diff (F3)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.diffPolicy",
          summary: "Diff two policy bundle sequences (F3)",
        }),
      ),
      HttpApiEndpoint.post("revokeApproval", EnterprisePaths.revokeApproval, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          approvalId: Schema.String,
          actorUserId: Schema.String,
        }),
        success: described(ApprovalDecisionResponseSchema, "Emergency approval revocation (F5)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.revokeApproval",
          summary: "Emergency-revoke an approved-but-unconsumed approval (F5)",
        }),
      ),
      HttpApiEndpoint.post("bulkDenyApprovals", EnterprisePaths.bulkDenyApprovals, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          approvalIds: Schema.Array(Schema.String),
          actorUserId: Schema.String,
        }),
        success: described(
          Schema.Struct({ denied: Schema.Number, skipped: Schema.Number }),
          "Bulk denial result (F5)",
        ),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.bulkDenyApprovals",
          summary: "Bulk-deny pending approvals; never bulk-approve (F5)",
        }),
      ),
      HttpApiEndpoint.post("archiveProof", EnterprisePaths.archiveProof, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          proofId: Schema.String,
          proofJson: Schema.String,
          source: Schema.String,
          retentionUntil: Schema.String,
          archiveId: Schema.optional(Schema.String),
        }),
        success: described(ArchiveResponseSchema, "Archive a proof (F6)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.archiveProof",
          summary: "Archive a proof with fingerprint (F6)",
        }),
      ),
      HttpApiEndpoint.get("exportArchive", EnterprisePaths.exportArchive, {
        params: { tenantId: Schema.String, archiveId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(ArchiveExportResponseSchema, "Export an archived proof (F6)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.exportArchive",
          summary: "Export an archived proof with its fingerprint (F6)",
        }),
      ),
      HttpApiEndpoint.post("custody", EnterprisePaths.custody, {
        params: { tenantId: Schema.String, archiveId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({ who: Schema.String, action: Schema.String }),
        success: described(LegalHoldResponseSchema, "Append chain-of-custody event (F6)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.custody",
          summary: "Append a chain-of-custody event (F6)",
        }),
      ),
      HttpApiEndpoint.post("legalHold", EnterprisePaths.legalHold, {
        params: { tenantId: Schema.String, archiveId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({ action: Schema.Literals(["PLACE", "REMOVE"]) }),
        success: described(LegalHoldResponseSchema, "Place or remove a legal hold (F6)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.legalHold",
          summary: "Place or remove a legal hold (F6)",
        }),
      ),
      HttpApiEndpoint.post("retentionSweep", EnterprisePaths.retentionSweep, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({ now: Schema.optional(Schema.String) }),
        success: described(RetentionSweepResponseSchema, "Retention sweep result (F6)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.retentionSweep",
          summary: "Run the tenant retention sweep (F6)",
        }),
      ),
      HttpApiEndpoint.post("putAlert", EnterprisePaths.alerts, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          alertId: Schema.String,
          severity: Schema.Literals(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
          kind: Schema.String,
          subjectId: Schema.optional(Schema.String),
          detail: Schema.String,
          at: Schema.optional(Schema.String),
        }),
        success: described(OkResponseSchema, "Security alert recorded (F9)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.putAlert",
          summary: "Record a tenant security alert (F9)",
        }),
      ),
      HttpApiEndpoint.get("listAlerts", EnterprisePaths.alerts, {
        params: { tenantId: Schema.String },
        query: AlertsQuery,
        success: described(Schema.Array(SecurityAlertSchema), "Security alerts (F9)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.listAlerts",
          summary: "List security alerts, optionally filtered by severity (F9)",
        }),
      ),
      HttpApiEndpoint.post("appendTimeline", EnterprisePaths.incidentTimeline, {
        params: { tenantId: Schema.String, incidentId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          actor: Schema.String,
          event: Schema.String,
          at: Schema.optional(Schema.String),
        }),
        success: described(OkResponseSchema, "Incident timeline event appended (F9)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.appendTimeline",
          summary: "Append an incident timeline event (F9)",
        }),
      ),
      HttpApiEndpoint.get("listTimeline", EnterprisePaths.incidentTimeline, {
        params: { tenantId: Schema.String, incidentId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(Schema.Array(IncidentTimelineEventSchema), "Incident timeline (F9)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.listTimeline",
          summary: "List an incident timeline (F9)",
        }),
      ),
      HttpApiEndpoint.post("revocationCampaign", EnterprisePaths.revocationCampaign, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          nodeIds: Schema.Array(Schema.String),
          reason: Schema.String,
          actorUserId: Schema.String,
        }),
        success: described(RevocationCampaignResponseSchema, "Audited revocation campaign (F9)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.revocationCampaign",
          summary: "Run an audited emergency revocation campaign (F9)",
        }),
      ),
      HttpApiEndpoint.get("forensicExport", EnterprisePaths.forensicExport, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(ForensicExportSchema, "Forensic export (F9)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.forensicExport",
          summary: "Export alerts and incident timelines for a tenant (F9)",
        }),
      ),
      HttpApiEndpoint.post("checkStorable", EnterprisePaths.checkStorable, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          record: DataRecordSchema,
          policy: Schema.optional(DataGovernancePolicySchema),
        }),
        success: described(GovernanceCheckSchema, "Storability governance check (F10)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.checkStorable",
          summary: "Check whether a data record may be stored (F10)",
        }),
      ),
      HttpApiEndpoint.post("checkExportable", EnterprisePaths.checkExportable, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          classification: Schema.Literals(["PUBLIC", "INTERNAL", "PRIVATE", "SECRET", "PII"]),
          policy: Schema.optional(DataGovernancePolicySchema),
        }),
        success: described(GovernanceCheckSchema, "Exportability governance check (F10)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.checkExportable",
          summary: "Check whether a classification may be exported (F10)",
        }),
      ),
      HttpApiEndpoint.post("classify", EnterprisePaths.classify, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          containsPii: Schema.Boolean,
          sensitivity: Schema.Literals(["PUBLIC", "INTERNAL", "PRIVATE", "SECRET"]),
        }),
        success: described(ClassifyResponseSchema, "Input classification (F10)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.classify",
          summary: "Classify an input (F10)",
        }),
      ),
      HttpApiEndpoint.post("piiRetention", EnterprisePaths.piiRetention, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          records: Schema.Array(DataRecordSchema),
          policy: Schema.optional(DataGovernancePolicySchema),
          now: Schema.optional(Schema.String),
        }),
        success: described(PiiRetentionResponseSchema, "PII retention evaluation (F10)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.piiRetention",
          summary: "Evaluate PII retention expiry (F10)",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "enterprise", description: "Enterprise admin surface (F1-F6, F11)." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
