/*
 * Wire schemas for the enterprise HTTP surface, extracted from
 * groups/enterprise.ts so the group file stays declarative.
 */
import { Schema } from "effect"
import { WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { PolicyBundleRecordSchema } from "../groups/policy"
import { EnrolledNodeSchema } from "../groups/enrollment"

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
  fingerprint: Schema.optional(Schema.String),
  restoredAt: Schema.optional(Schema.String),
})

export const RestoreResponseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("RESTORED"), record: BackupRecordSchema }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const KeyRotationRecordSchema = Schema.Struct({
  tenantId: Schema.String,
  rotationId: Schema.String,
  nodeId: Schema.String,
  mode: Schema.Literals(["DRY_RUN", "CONFIRMED"]),
  previousEpoch: Schema.Number,
  nextEpoch: Schema.Number,
  previousFingerprint: Schema.String,
  nextFingerprint: Schema.String,
  rotatedAt: Schema.String,
})

export const KeyRotationPreviewResponseSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("PREVIEW"),
    record: KeyRotationRecordSchema,
    currentEpoch: Schema.Number,
    nextEpoch: Schema.Number,
    currentFingerprint: Schema.String,
    nextFingerprint: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const KeyRotationResponseSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("ROTATED"),
    record: KeyRotationRecordSchema,
    nodeRecord: EnrolledNodeSchema,
    newSecretKeyB64: Schema.optional(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const KeyBackupMaterialSchema = Schema.Struct({
  nodeId: Schema.String,
  publicKey: Schema.String,
  secretKey: Schema.optional(Schema.String),
})

export const KeyBackupResponseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("BACKED_UP"), record: BackupRecordSchema }),
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

export const UsageExportEntrySchema = Schema.Struct({
  feature: Schema.String,
  units: Schema.Number,
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

export const PendingRevocationDeliverySchema = Schema.Struct({
  deliveryId: Schema.String,
  orgId: Schema.String,
  agreementId: Schema.String,
  subjectId: Schema.String,
  reason: Schema.String,
  queuedAt: Schema.String,
  deliveredAt: Schema.optional(Schema.String),
  failureReason: Schema.optional(Schema.String),
})

export const ReceivedRevocationSchema = Schema.Struct({
  receivedId: Schema.String,
  orgId: Schema.String,
  agreementId: Schema.String,
  senderOrgId: Schema.String,
  subjectId: Schema.String,
  reason: Schema.String,
  receivedAt: Schema.String,
})

export const RevocationDeliveryResponseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("QUEUED"), record: PendingRevocationDeliverySchema }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const RevocationReceiveResponseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("RECEIVED"), record: ReceivedRevocationSchema }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const WebhookEndpointSchema = Schema.Struct({
  tenantId: Schema.String,
  webhookId: Schema.String,
  url: Schema.String,
  active: Schema.Boolean,
  createdAt: Schema.String,
})

export const WebhookDeliverySchema = Schema.Struct({
  tenantId: Schema.String,
  deliveryId: Schema.String,
  webhookId: Schema.String,
  payloadJson: Schema.String,
  status: Schema.Literals(["PENDING", "DELIVERED", "FAILED"]),
  attempts: Schema.Number,
  nextAttemptAt: Schema.String,
  createdAt: Schema.String,
  deliveredAt: Schema.optional(Schema.String),
  lastError: Schema.optional(Schema.String),
})

export const WebhookDeliverySummarySchema = Schema.Struct({
  delivered: Schema.Number,
  failed: Schema.Number,
  pending: Schema.Number,
})

export const CentralApprovalRecordSchema = Schema.Struct({
  tenantId: Schema.String,
  approvalId: Schema.String,
  requestHash: Schema.String,
  requesterId: Schema.String,
  approverId: Schema.optional(Schema.String),
  status: Schema.Literals([
    "PENDING",
    "APPROVED",
    "DENIED",
    "CLAIMED",
    "CONSUMED",
    "EXPIRED",
    "INVALIDATED",
  ]),
  exactRequestJson: Schema.String,
  createdAt: Schema.String,
  expiresAt: Schema.String,
  decidedAt: Schema.optional(Schema.String),
})

export const ApprovalListQuery = Schema.Struct({
  ...WorkspaceRoutingQuery.fields,
  status: Schema.optional(
    Schema.Literals(["PENDING", "APPROVED", "DENIED", "CLAIMED", "CONSUMED", "EXPIRED", "INVALIDATED"]),
  ),
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
