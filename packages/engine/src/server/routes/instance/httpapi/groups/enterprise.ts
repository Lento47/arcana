import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"
import { PolicyBundleRecordSchema, SignedPolicyEnvelopeSchema } from "./policy"

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

export const BackupRecordSchema = Schema.Struct({
  tenantId: Schema.String,
  backupId: Schema.String,
  kind: Schema.Literals(["DATABASE", "KEYS"]),
  createdAt: Schema.String,
  digest: Schema.String,
  restoredAt: Schema.optional(Schema.String),
})

export const RestoreResponseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("RESTORED"), record: BackupRecordSchema }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const ReliabilityConfigSchema = Schema.Struct({
  availabilityTarget: Schema.Number,
  rpoMs: Schema.Number,
  rtoMs: Schema.Number,
})

export const DrillRecordSchema = Schema.Struct({
  tenantId: Schema.String,
  drillId: Schema.String,
  startedAt: Schema.String,
  finishedAt: Schema.String,
  restoredDigest: Schema.String,
  measuredRpoMs: Schema.Number,
  measuredRtoMs: Schema.Number,
})

export const DrillResultSchema = Schema.Struct({
  pass: Schema.Boolean,
  violations: Schema.Array(Schema.String),
  measuredRpoMs: Schema.Number,
  measuredRtoMs: Schema.Number,
})

export const DrillResponseSchema = Schema.Struct({
  result: DrillResultSchema,
  record: DrillRecordSchema,
})

export const FederationAgreementSchema = Schema.Struct({
  agreementId: Schema.String,
  version: Schema.Number,
  orgA: Schema.String,
  orgB: Schema.String,
  audienceRestrictions: Schema.Array(Schema.String),
  validFrom: Schema.String,
  validTo: Schema.String,
  status: Schema.Literals(["ACTIVE", "REVOKED"]),
})

export const ProofExchangeRecordSchema = Schema.Struct({
  agreementId: Schema.String,
  orgId: Schema.String,
  remoteProofId: Schema.String,
  fingerprint: Schema.String,
  exchangedAt: Schema.String,
  origin: Schema.String,
})

export const RevocationPropagationRecordSchema = Schema.Struct({
  agreementId: Schema.String,
  orgId: Schema.String,
  subjectId: Schema.String,
  reason: Schema.String,
  propagatedAt: Schema.String,
})

export const ProofExchangeResponseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("EXCHANGED"), record: ProofExchangeRecordSchema }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const RevocationPropagationResponseSchema = Schema.Union([
  RevocationPropagationRecordSchema,
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const AuthorityScopeSchema = Schema.Struct({
  actions: Schema.Array(Schema.String),
  resources: Schema.Array(Schema.String),
})

export const IntersectionResponseSchema = Schema.Union([
  Schema.Struct({ allowed: Schema.Literal(true), scope: AuthorityScopeSchema }),
  Schema.Struct({ allowed: Schema.Literal(false), reason: Schema.String }),
])

export const EntitlementResponseSchema = Schema.Struct({ entitled: Schema.Boolean })

export const MeteringCheckResponseSchema = Schema.Struct({
  decision: Schema.Literals(["ALLOW", "DENY", "REQUIRE_APPROVAL"]),
})

export const DiagnosticsSchema = Schema.Struct({
  version: Schema.String,
  runtime: Schema.Record(Schema.String, Schema.String),
  config: Schema.Record(Schema.String, Schema.String),
  logs: Schema.Array(Schema.String),
})

export const UpgradePolicySchema = Schema.Struct({
  supportedFrom: Schema.String,
  breakingChangesRequire: Schema.Literals(["major_version", "migration_runbook"]),
  rollbackAllowed: Schema.Boolean,
})

export const NodeDiagnosticsSchema = Schema.Struct({
  tenantId: Schema.String,
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
  lastSeenAt: Schema.optional(Schema.String),
  lastSyncAt: Schema.optional(Schema.String),
  registeredAt: Schema.String,
  revokedAt: Schema.optional(Schema.String),
  health: Schema.Literals(["UNKNOWN", "HEALTHY", "STALE", "REVOKED", "QUARANTINED"]),
})

export const EscalationPolicyInputSchema = Schema.Struct({
  policyId: Schema.String,
  maxWaitMs: Schema.Number,
  fallbackApprovers: Schema.Array(Schema.String),
  requireBreakGlass: Schema.Boolean,
})

export const EscalationPolicySchema = Schema.Struct({
  tenantId: Schema.String,
  policyId: Schema.String,
  maxWaitMs: Schema.Number,
  fallbackApprovers: Schema.Array(Schema.String),
  requireBreakGlass: Schema.Boolean,
})

export const EscalationEventSchema = Schema.Struct({
  tenantId: Schema.String,
  eventId: Schema.String,
  approvalId: Schema.String,
  at: Schema.String,
  reason: Schema.String,
  suggestedApprovers: Schema.Array(Schema.String),
})

export const EscalationCheckSchema = Schema.Union([
  Schema.Struct({
    escalated: Schema.Literal(true),
    reason: Schema.String,
    suggestedApprovers: Schema.Array(Schema.String),
    requireBreakGlass: Schema.Boolean,
  }),
  Schema.Struct({ escalated: Schema.Literal(false), reason: Schema.String }),
])

export const AdminEventPayloadSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("approval.pending"),
    approvalId: Schema.String,
    requestHash: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("node.revoked"),
    nodeId: Schema.String,
    reason: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("policy.promoted"),
    policyId: Schema.String,
    sequence: Schema.Number,
  }),
  Schema.Struct({
    kind: Schema.Literal("alert.critical"),
    alertId: Schema.String,
  }),
])

export const AdminEventRecordSchema = Schema.Struct({
  kind: Schema.Literals(["approval.pending", "node.revoked", "policy.promoted", "alert.critical"]),
  tenantId: Schema.String,
  at: Schema.String,
  approvalId: Schema.optional(Schema.String),
  requestHash: Schema.optional(Schema.String),
  nodeId: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.String),
  policyId: Schema.optional(Schema.String),
  sequence: Schema.optional(Schema.Number),
  alertId: Schema.optional(Schema.String),
  recordedAt: Schema.String,
})

export const UsageEventSchema = Schema.Struct({
  tenantId: Schema.String,
  eventId: Schema.String,
  feature: Schema.String,
  units: Schema.Number,
  at: Schema.String,
})

export const UsageResponseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("summary"), feature: Schema.String, units: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("events"), events: Schema.Array(UsageEventSchema) }),
])

export const QuotaStatusSchema = Schema.Struct({
  ok: Schema.Boolean,
  used: Schema.Number,
  limit: Schema.Number,
  overQuota: Schema.Boolean,
})

export const CrossOrgApprovalRuleSchema = Schema.Struct({
  ruleId: Schema.String,
  orgA: Schema.String,
  orgB: Schema.String,
  agreementId: Schema.String,
  actionPatterns: Schema.Array(Schema.String),
  maxPerDay: Schema.Number,
})

export const RoutedApprovalSchema = Schema.Struct({
  routingId: Schema.String,
  ruleId: Schema.String,
  orgA: Schema.String,
  orgB: Schema.String,
  agreementId: Schema.String,
  approvalId: Schema.String,
  action: Schema.String,
  routedAt: Schema.String,
})

export const CrossOrgRoutingResponseSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("ROUTED"),
    record: RoutedApprovalSchema,
    rule: CrossOrgApprovalRuleSchema,
  }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const UpgradeRingSchema = Schema.Struct({
  tenantId: Schema.String,
  ringId: Schema.String,
  name: Schema.String,
  targetVersion: Schema.String,
  paused: Schema.Boolean,
  createdAt: Schema.String,
})

export const RingAssignResponseSchema = Schema.Struct({
  ok: Schema.Boolean,
  reason: Schema.optional(Schema.String),
})

export const RolloutDecisionSchema = Schema.Struct({
  nodeId: Schema.String,
  allowed: Schema.Boolean,
  reason: Schema.String,
})

export const PolicyDraftValidationResponseSchema = Schema.Union([
  Schema.Struct({ valid: Schema.Literal(true), record: PolicyBundleRecordSchema }),
  Schema.Struct({ valid: Schema.Literal(false), reason: Schema.String }),
])

export const AnomalySignalSchema = Schema.Struct({
  signalId: Schema.String,
  tenantId: Schema.String,
  kind: Schema.Literals(["alert_burst", "revocation_velocity", "proof_backlog_growth", "stale_node_count"]),
  severity: Schema.Literals(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  detail: Schema.String,
  at: Schema.String,
})

export const TicketPayloadSchema = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  labels: Schema.Array(Schema.String),
  priority: Schema.Literals(["low", "medium", "high", "urgent"]),
})

export const AlertsQuery = Schema.Struct({
  ...WorkspaceRoutingQuery.fields,
  severity: Schema.optional(Schema.Literals(["LOW", "MEDIUM", "HIGH", "CRITICAL"])),
})

export const FederationListQuery = Schema.Struct({
  ...WorkspaceRoutingQuery.fields,
  orgId: Schema.optional(Schema.String),
})

export const AdminEventsQuery = Schema.Struct({
  ...WorkspaceRoutingQuery.fields,
  kind: Schema.optional(
    Schema.Literals(["approval.pending", "node.revoked", "policy.promoted", "alert.critical"]),
  ),
  since: Schema.optional(Schema.String),
})

export const UsageQuery = Schema.Struct({
  ...WorkspaceRoutingQuery.fields,
  feature: Schema.optional(Schema.String),
  since: Schema.optional(Schema.String),
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
  backup: `${root}/organizations/:tenantId/reliability/backups`,
  restore: `${root}/organizations/:tenantId/reliability/backups/:backupId/restore`,
  drill: `${root}/organizations/:tenantId/reliability/drills`,
  drills: `${root}/organizations/:tenantId/reliability/drills`,
  federationAgreements: `${root}/organizations/:tenantId/federation/agreements`,
  federationAgreement: `${root}/organizations/:tenantId/federation/agreements/:agreementId`,
  federationExchange: `${root}/organizations/:tenantId/federation/exchange`,
  federationRevoke: `${root}/organizations/:tenantId/federation/revoke`,
  federationExchanges: `${root}/organizations/:tenantId/federation/exchanges`,
  federationRevocations: `${root}/organizations/:tenantId/federation/revocations`,
  federationIntersect: `${root}/organizations/:tenantId/federation/intersect`,
  entitlement: `${root}/organizations/:tenantId/commercial/entitlement`,
  meteringCheck: `${root}/organizations/:tenantId/commercial/metering-check`,
  diagnostics: `${root}/organizations/:tenantId/commercial/diagnostics`,
  upgradePolicy: `${root}/organizations/:tenantId/commercial/upgrade-policy`,
  nodeDetail: `${root}/organizations/:tenantId/fleet/:nodeId`,
  escalationPolicy: `${root}/organizations/:tenantId/escalations/policy`,
  escalationCheck: `${root}/organizations/:tenantId/escalations/check`,
  escalationEvents: `${root}/organizations/:tenantId/escalations`,
  adminEvents: `${root}/organizations/:tenantId/admin-events`,
  siemExport: `${root}/organizations/:tenantId/admin-events/siem-export`,
  usage: `${root}/organizations/:tenantId/commercial/usage`,
  usageQuota: `${root}/organizations/:tenantId/commercial/usage/quota`,
  federationRules: `${root}/organizations/:tenantId/federation/rules`,
  federationRouteApproval: `${root}/organizations/:tenantId/federation/route-approval`,
  federationRouted: `${root}/organizations/:tenantId/federation/routed`,
  rings: `${root}/organizations/:tenantId/fleet/rings`,
  ringAssign: `${root}/organizations/:tenantId/fleet/rings/:ringId/assign`,
  ringPlan: `${root}/organizations/:tenantId/fleet/rings/:ringId/plan`,
  validatePolicyDraft: `${root}/organizations/:tenantId/policies/validate-draft`,
  anomalyScan: `${root}/organizations/:tenantId/anomaly-scan`,
  ticketingExport: `${root}/organizations/:tenantId/ticketing/export`,
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
      HttpApiEndpoint.post("backup", EnterprisePaths.backup, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          backupId: Schema.String,
          kind: Schema.Literals(["DATABASE", "KEYS"]),
          digest: Schema.String,
        }),
        success: described(BackupRecordSchema, "Backup recorded (F7)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.backup",
          summary: "Record a digest-verified backup (F7)",
        }),
      ),
      HttpApiEndpoint.post("restore", EnterprisePaths.restore, {
        params: { tenantId: Schema.String, backupId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({ presentedDigest: Schema.String }),
        success: described(RestoreResponseSchema, "Backup restore result (F7)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.restore",
          summary: "Restore a backup only when its digest matches (F7)",
        }),
      ),
      HttpApiEndpoint.post("drill", EnterprisePaths.drill, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          drillId: Schema.String,
          startedAt: Schema.String,
          finishedAt: Schema.String,
          restoredDigest: Schema.String,
          measuredRpoMs: Schema.Number,
          measuredRtoMs: Schema.Number,
          config: Schema.optional(ReliabilityConfigSchema),
        }),
        success: described(DrillResponseSchema, "Restore drill evaluation (F7)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.drill",
          summary: "Record and evaluate a restore drill against RPO/RTO (F7)",
        }),
      ),
      HttpApiEndpoint.get("drills", EnterprisePaths.drills, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(Schema.Array(DrillRecordSchema), "Restore drill history (F7)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.drills",
          summary: "List restore drills (F7)",
        }),
      ),
      HttpApiEndpoint.post("putFederationAgreement", EnterprisePaths.federationAgreements, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: FederationAgreementSchema,
        success: described(FederationAgreementSchema, "Federation agreement stored (F8)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.putFederationAgreement",
          summary: "Store a federation agreement (F8)",
        }),
      ),
      HttpApiEndpoint.get("getFederationAgreement", EnterprisePaths.federationAgreement, {
        params: { tenantId: Schema.String, agreementId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(
          Schema.Union([FederationAgreementSchema, Schema.Null]),
          "Federation agreement (F8)",
        ),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.getFederationAgreement",
          summary: "Read a federation agreement (F8)",
        }),
      ),
      HttpApiEndpoint.post("federationExchange", EnterprisePaths.federationExchange, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          agreementId: Schema.String,
          orgId: Schema.String,
          remoteProofId: Schema.String,
          fingerprint: Schema.String,
          origin: Schema.String,
        }),
        success: described(ProofExchangeResponseSchema, "Proof exchange result (F8)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.federationExchange",
          summary: "Exchange a remote proof under an active agreement (F8)",
        }),
      ),
      HttpApiEndpoint.post("federationRevoke", EnterprisePaths.federationRevoke, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          agreementId: Schema.String,
          orgId: Schema.String,
          subjectId: Schema.String,
          reason: Schema.String,
        }),
        success: described(RevocationPropagationResponseSchema, "Revocation propagation (F8)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.federationRevoke",
          summary: "Propagate a revocation under an active agreement (F8)",
        }),
      ),
      HttpApiEndpoint.get("federationExchanges", EnterprisePaths.federationExchanges, {
        params: { tenantId: Schema.String },
        query: FederationListQuery,
        success: described(Schema.Array(ProofExchangeRecordSchema), "Proof exchanges (F8)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.federationExchanges",
          summary: "List proof exchanges for an organization (F8)",
        }),
      ),
      HttpApiEndpoint.get("federationRevocations", EnterprisePaths.federationRevocations, {
        params: { tenantId: Schema.String },
        query: FederationListQuery,
        success: described(
          Schema.Array(RevocationPropagationRecordSchema),
          "Revocation propagations (F8)",
        ),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.federationRevocations",
          summary: "List revocation propagations for an organization (F8)",
        }),
      ),
      HttpApiEndpoint.post("federationIntersect", EnterprisePaths.federationIntersect, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          agreementId: Schema.String,
          localActions: Schema.Array(Schema.String),
          localResources: Schema.Array(Schema.String),
          remoteActions: Schema.Array(Schema.String),
          remoteResources: Schema.Array(Schema.String),
        }),
        success: described(IntersectionResponseSchema, "Authority intersection (F8)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.federationIntersect",
          summary: "Compute federated authority intersection (never broadens) (F8)",
        }),
      ),
      HttpApiEndpoint.post("entitlement", EnterprisePaths.entitlement, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          tier: Schema.Literals(["COMMUNITY", "TEAM", "ENTERPRISE"]),
          feature: Schema.Literals([
            "local_runtime",
            "shared_policy",
            "shared_approvals",
            "fleet_control",
            "sso",
            "federation",
            "compliance_exports",
          ]),
        }),
        success: described(EntitlementResponseSchema, "Entitlement check (F12)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.entitlement",
          summary: "Check license-tier entitlement (F12)",
        }),
      ),
      HttpApiEndpoint.post("meteringCheck", EnterprisePaths.meteringCheck, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          decision: Schema.Literals(["ALLOW", "DENY", "REQUIRE_APPROVAL"]),
          meteringOk: Schema.Boolean,
          overQuota: Schema.optional(Schema.Boolean),
        }),
        success: described(MeteringCheckResponseSchema, "Metering-never-affects-security (F12)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.meteringCheck",
          summary: "Verify metering cannot change a security decision (F12)",
        }),
      ),
      HttpApiEndpoint.post("diagnostics", EnterprisePaths.diagnostics, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          diagnostics: DiagnosticsSchema,
          secretFragments: Schema.Array(Schema.String),
        }),
        success: described(DiagnosticsSchema, "Redacted diagnostics (F12)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.diagnostics",
          summary: "Redact secrets from support diagnostics (F12)",
        }),
      ),
      HttpApiEndpoint.get("upgradePolicy", EnterprisePaths.upgradePolicy, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(UpgradePolicySchema, "Upgrade policy (F12)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.upgradePolicy",
          summary: "Read the default upgrade policy (F12)",
        }),
      ),
      HttpApiEndpoint.get("nodeDetail", EnterprisePaths.nodeDetail, {
        params: { tenantId: Schema.String, nodeId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(
          Schema.Union([NodeDiagnosticsSchema, Schema.Null]),
          "Fleet node remote diagnostics (F4)",
        ),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.nodeDetail",
          summary: "Read remote diagnostics for a fleet node (F4)",
        }),
      ),
      HttpApiEndpoint.post("putEscalationPolicy", EnterprisePaths.escalationPolicy, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: EscalationPolicyInputSchema,
        success: described(EscalationPolicySchema, "Escalation policy stored (F5)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.putEscalationPolicy",
          summary: "Store a tenant escalation policy (F5)",
        }),
      ),
      HttpApiEndpoint.get("getEscalationPolicy", EnterprisePaths.escalationPolicy, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(
          Schema.Union([EscalationPolicySchema, Schema.Null]),
          "Escalation policy (F5)",
        ),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.getEscalationPolicy",
          summary: "Read a tenant escalation policy (F5)",
        }),
      ),
      HttpApiEndpoint.post("escalationCheck", EnterprisePaths.escalationCheck, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          approvalId: Schema.String,
          now: Schema.optional(Schema.String),
        }),
        success: described(EscalationCheckSchema, "Escalation evaluation (F5)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.escalationCheck",
          summary: "Evaluate and record approval escalation (F5)",
        }),
      ),
      HttpApiEndpoint.get("escalationEvents", EnterprisePaths.escalationEvents, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(Schema.Array(EscalationEventSchema), "Escalation events (F5)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.escalationEvents",
          summary: "List recorded escalation events (F5)",
        }),
      ),
      HttpApiEndpoint.post("putAdminEvent", EnterprisePaths.adminEvents, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: AdminEventPayloadSchema,
        success: described(AdminEventRecordSchema, "Admin event recorded (F11)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.putAdminEvent",
          summary: "Record a canonical admin event (F11)",
        }),
      ),
      HttpApiEndpoint.get("listAdminEvents", EnterprisePaths.adminEvents, {
        params: { tenantId: Schema.String },
        query: AdminEventsQuery,
        success: described(Schema.Array(AdminEventRecordSchema), "Admin events (F11)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.listAdminEvents",
          summary: "List canonical admin events (F11)",
        }),
      ),
      HttpApiEndpoint.get("siemExport", EnterprisePaths.siemExport, {
        params: { tenantId: Schema.String },
        query: AdminEventsQuery,
        success: described(Schema.String, "SIEM CEF export (F11)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.siemExport",
          summary: "Export admin events as ArcSight CEF (F11)",
        }),
      ),
      HttpApiEndpoint.post("putUsage", EnterprisePaths.usage, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          eventId: Schema.String,
          feature: Schema.String,
          units: Schema.Number,
          at: Schema.optional(Schema.String),
        }),
        success: described(UsageEventSchema, "Usage event recorded (F12)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.putUsage",
          summary: "Record a usage-metering event (F12)",
        }),
      ),
      HttpApiEndpoint.get("getUsage", EnterprisePaths.usage, {
        params: { tenantId: Schema.String },
        query: UsageQuery,
        success: described(UsageResponseSchema, "Usage summary or events (F12)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.getUsage",
          summary: "Read metered usage (F12)",
        }),
      ),
      HttpApiEndpoint.post("usageQuota", EnterprisePaths.usageQuota, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          limit: Schema.Number,
          feature: Schema.String,
          since: Schema.optional(Schema.String),
        }),
        success: described(QuotaStatusSchema, "Informational quota status (F12)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.usageQuota",
          summary: "Evaluate quota status; never affects decisions (F12)",
        }),
      ),
      HttpApiEndpoint.post("putFederationRule", EnterprisePaths.federationRules, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          ruleId: Schema.String,
          orgB: Schema.String,
          agreementId: Schema.String,
          actionPatterns: Schema.Array(Schema.String),
          maxPerDay: Schema.Number,
        }),
        success: described(CrossOrgApprovalRuleSchema, "Cross-org approval rule (F8)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.putFederationRule",
          summary: "Store a bounded cross-org approval rule (F8)",
        }),
      ),
      HttpApiEndpoint.get("listFederationRules", EnterprisePaths.federationRules, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(Schema.Array(CrossOrgApprovalRuleSchema), "Cross-org approval rules (F8)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.listFederationRules",
          summary: "List cross-org approval rules for an organization (F8)",
        }),
      ),
      HttpApiEndpoint.post("routeCrossOrgApproval", EnterprisePaths.federationRouteApproval, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          orgB: Schema.String,
          agreementId: Schema.String,
          approvalId: Schema.String,
          action: Schema.String,
        }),
        success: described(CrossOrgRoutingResponseSchema, "Cross-org approval routing (F8)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.routeCrossOrgApproval",
          summary: "Route an approval under an active agreement and exact rule (F8)",
        }),
      ),
      HttpApiEndpoint.get("listRoutedApprovals", EnterprisePaths.federationRouted, {
        params: { tenantId: Schema.String },
        query: FederationListQuery,
        success: described(Schema.Array(RoutedApprovalSchema), "Routed approvals (F8)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.listRoutedApprovals",
          summary: "List routed cross-org approvals (F8)",
        }),
      ),
      HttpApiEndpoint.post("putUpgradeRing", EnterprisePaths.rings, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          ringId: Schema.String,
          name: Schema.String,
          targetVersion: Schema.String,
          paused: Schema.Boolean,
        }),
        success: described(UpgradeRingSchema, "Upgrade ring stored (F4)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.putUpgradeRing",
          summary: "Store an upgrade ring (F4)",
        }),
      ),
      HttpApiEndpoint.get("listUpgradeRings", EnterprisePaths.rings, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(Schema.Array(UpgradeRingSchema), "Upgrade rings (F4)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.listUpgradeRings",
          summary: "List upgrade rings (F4)",
        }),
      ),
      HttpApiEndpoint.post("assignRingNode", EnterprisePaths.ringAssign, {
        params: { tenantId: Schema.String, ringId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({ nodeId: Schema.String }),
        success: described(RingAssignResponseSchema, "Ring node assignment (F4)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.assignRingNode",
          summary: "Assign a fleet node to an upgrade ring (F4)",
        }),
      ),
      HttpApiEndpoint.get("ringPlan", EnterprisePaths.ringPlan, {
        params: { tenantId: Schema.String, ringId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(Schema.Array(RolloutDecisionSchema), "Ring rollout plan (F4)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.ringPlan",
          summary: "Plan ring rollout with per-node gates (F4)",
        }),
      ),
      HttpApiEndpoint.post("validatePolicyDraft", EnterprisePaths.validatePolicyDraft, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          envelope: SignedPolicyEnvelopeSchema,
          activationTime: Schema.optional(Schema.String),
        }),
        success: described(PolicyDraftValidationResponseSchema, "Policy draft validation (F3)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.validatePolicyDraft",
          summary: "Validate a signed policy draft without publishing (F3)",
        }),
      ),
      HttpApiEndpoint.post("anomalyScan", EnterprisePaths.anomalyScan, {
        params: { tenantId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          alertsLastHour: Schema.Number,
          revocationsLastHour: Schema.Number,
          maxProofBacklog: Schema.Number,
          staleNodeCount: Schema.Number,
          totalNodeCount: Schema.Number,
        }),
        success: described(Schema.Array(AnomalySignalSchema), "Anomaly signals (F9)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.anomalyScan",
          summary: "Run anomaly heuristics and record signals as alerts (F9)",
        }),
      ),
      HttpApiEndpoint.get("ticketingExport", EnterprisePaths.ticketingExport, {
        params: { tenantId: Schema.String },
        query: AdminEventsQuery,
        success: described(Schema.Array(TicketPayloadSchema), "Ticketing payloads (F11)"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enterprise.ticketingExport",
          summary: "Export admin events as canonical ticketing payloads (F11)",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "enterprise", description: "Enterprise admin surface (F1-F6, F11)." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
