import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { fleetView } from "@arcana/core/enterprise/fleet"
import {
  decideApproval,
  type CentralApprovalRecord,
} from "@arcana/core/enterprise/approvals"
import { bulkDeny, emergencyRevokeApproval } from "@arcana/core/enterprise/approvals"
import { checkPermission, type Permission } from "@arcana/core/enterprise/identity"
import {
  applyRetention,
  appendCustody,
  archiveProof,
  exportProof,
  placeLegalHold,
  removeLegalHold,
} from "@arcana/core/enterprise/audit-archive"
import {
  forensicExport,
  runRevocationCampaign,
} from "@arcana/core/enterprise/security-ops"
import {
  applyPiiRetention,
  assertExportable,
  assertStorable,
  classifyInput,
  DEFAULT_DATA_GOVERNANCE_POLICY,
} from "@arcana/core/enterprise/data-governance"
import { diffPolicyBundles, promotePolicyBundle } from "@arcana/core/enterprise/policy-lifecycle"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import {
  controlStateFor,
  issuerContext,
  policyTargetStoreFor,
  type ControlPlaneState,
} from "./control-state"

function hasPermission(
  state: ControlPlaneState,
  tenantId: string,
  userId: string,
  action: Permission,
): boolean {
  return checkPermission({
    tenantId,
    userId,
    action,
    active: state.identity.isUserActive(tenantId, userId),
    roles: state.identity.rolesFor(tenantId, userId),
  }).allowed
}

export const enterpriseHandlers = HttpApiBuilder.group(InstanceHttpApi, "enterprise", (handlers) =>
  Effect.gen(function* () {
    const resolveDirectory = Effect.fn("EnterpriseHttpApi.resolveDirectory")(function* (
      queryDirectory?: string,
    ) {
      const routeDirectory = Option.getOrUndefined(
        (yield* Effect.serviceOption(WorkspaceRouteContext)).pipe(
          Option.map((ctx) => ctx.directory),
        ),
      )
      return routeDirectory || queryDirectory || process.cwd()
    })

    const createOrganization = Effect.fn("EnterpriseHttpApi.createOrganization")(function* (ctx: {
      payload: { tenantId: string; name: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      const now = new Date().toISOString()
      const org = { tenantId: ctx.payload.tenantId, id: `org-${ctx.payload.tenantId}`, name: ctx.payload.name, createdAt: now }
      state.tenants.putOrganization(org)
      return org
    })

    const assignRole = Effect.fn("EnterpriseHttpApi.assignRole")(function* (ctx: {
      params: { tenantId: string }
      payload: { userId: string; role: "OWNER" | "ADMIN" | "OPERATOR" | "AUDITOR" | "MEMBER" }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      controlStateFor(directory).identity.assignRole({
        tenantId: ctx.params.tenantId,
        userId: ctx.payload.userId,
        role: ctx.payload.role,
        assignedAt: new Date().toISOString(),
      })
      return true
    })

    const fleet = Effect.fn("EnterpriseHttpApi.fleet")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      return fleetView(state.fleet, ctx.params.tenantId, new Date()).map((node) => ({
        nodeId: node.nodeId,
        health: node.health,
        version: node.version,
        enforcementMode: node.enforcementMode,
        proofBacklog: node.proofBacklog,
        lastSeenAt: node.lastSeenAt,
      }))
    })

    const createApproval = Effect.fn("EnterpriseHttpApi.createApproval")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        approvalId: string
        requestHash: string
        requesterId: string
        exactRequestJson: string
        expiresAt: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const record: CentralApprovalRecord = {
        tenantId: ctx.params.tenantId,
        approvalId: ctx.payload.approvalId,
        requestHash: ctx.payload.requestHash,
        requesterId: ctx.payload.requesterId,
        status: "PENDING",
        exactRequestJson: ctx.payload.exactRequestJson,
        createdAt: new Date().toISOString(),
        expiresAt: ctx.payload.expiresAt,
      }
      controlStateFor(directory).approvals.put(record)
      return true
    })

    const decide = Effect.fn("EnterpriseHttpApi.decideApproval")(function* (ctx: {
      params: { tenantId: string; approvalId: string }
      payload: {
        actorUserId: string
        decision: "APPROVE" | "DENY"
        inspectedRequestJson?: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      const record = state.approvals.get(ctx.params.tenantId, ctx.params.approvalId)
      if (!record) {
        return { kind: "REJECTED" as const, reason: "approval not found" }
      }
      const result = decideApproval(record, {
        actorUserId: ctx.payload.actorUserId,
        decision: ctx.payload.decision === "APPROVE" ? { decision: "APPROVE" } : { decision: "DENY" },
        inspectedRequestJson: ctx.payload.inspectedRequestJson,
        now: new Date(),
      }, state.approvals)
      if (result.kind === "DECIDED") {
        return { kind: "DECIDED" as const, status: result.record.status }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    const audit = Effect.fn("EnterpriseHttpApi.audit")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).identity.auditLog(ctx.params.tenantId)
    })

    const registerNode = Effect.fn("EnterpriseHttpApi.registerNode")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        nodeId: string
        organizationId: string
        environment: string
        version: string
        upgradeRing: number
        nodeKeyEpoch: number
        enforcementMode: "ONLINE" | "OFFLINE_RESTRICTED" | "OFFLINE_READ_ONLY" | "QUARANTINED"
        policySequence: number
        policyDigest: string
        revocationSequence: number
        revocationDigest: string
        proofBacklog: number
        registeredAt?: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const now = new Date().toISOString()
      controlStateFor(directory).fleet.putNode({
        tenantId: ctx.params.tenantId,
        nodeId: ctx.payload.nodeId,
        organizationId: ctx.payload.organizationId,
        environment: ctx.payload.environment,
        version: ctx.payload.version,
        upgradeRing: ctx.payload.upgradeRing,
        nodeKeyEpoch: ctx.payload.nodeKeyEpoch,
        enforcementMode: ctx.payload.enforcementMode,
        policySequence: ctx.payload.policySequence,
        policyDigest: ctx.payload.policyDigest,
        revocationSequence: ctx.payload.revocationSequence,
        revocationDigest: ctx.payload.revocationDigest,
        proofBacklog: ctx.payload.proofBacklog,
        lastSeenAt: now,
        registeredAt: ctx.payload.registeredAt ?? now,
      })
      return { ok: true }
    })

    const heartbeat = Effect.fn("EnterpriseHttpApi.heartbeat")(function* (ctx: {
      params: { tenantId: string; nodeId: string }
      payload: {
        enforcementMode?: "ONLINE" | "OFFLINE_RESTRICTED" | "OFFLINE_READ_ONLY" | "QUARANTINED"
        policySequence?: number
        policyDigest?: string
        revocationSequence?: number
        revocationDigest?: string
        proofBacklog?: number
        lastSyncAt?: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      controlStateFor(directory).fleet.updateHeartbeat(ctx.params.tenantId, ctx.params.nodeId, {
        ...ctx.payload,
        lastSeenAt: new Date().toISOString(),
      })
      return { ok: true }
    })

    const promotePolicy = Effect.fn("EnterpriseHttpApi.promotePolicy")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        sourceSequence: number
        targetEnvironment: string
        requestedBy: string
        approvedBy: string
        activationTime?: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const issuer = issuerContext()
      if (!issuer.ok) {
        return { kind: "REJECTED" as const, reason: `issuer not configured: ${issuer.reason}` }
      }
      const state = controlStateFor(directory)
      const result = promotePolicyBundle(
        {
          tenantId: ctx.params.tenantId,
          sourceStore: state.policyStore,
          targetStore: policyTargetStoreFor(directory, ctx.payload.targetEnvironment),
          sourceSequence: ctx.payload.sourceSequence,
          targetEnvironment: ctx.payload.targetEnvironment,
          requestedBy: ctx.payload.requestedBy,
          approvedBy: ctx.payload.approvedBy,
          approverHasPermission: hasPermission(
            state,
            ctx.params.tenantId,
            ctx.payload.approvedBy,
            "policy.publish",
          ),
          activationTime: ctx.payload.activationTime,
          trustedIssuerPublicKeys: issuer.context.issuerPublicKeys,
        },
        state.identity,
      )
      if (result.kind === "PROMOTED") {
        return { kind: "PROMOTED" as const, record: result.record, promotionId: result.promotionId }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    const diffPolicy = Effect.fn("EnterpriseHttpApi.diffPolicy")(function* (ctx: {
      params: { tenantId: string }
      payload: { beforeSequence?: number; afterSequence?: number }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const store = controlStateFor(directory).policyStore
      const before =
        ctx.payload.beforeSequence === undefined
          ? undefined
          : store.getBySequence(ctx.payload.beforeSequence)
      const after =
        ctx.payload.afterSequence === undefined
          ? undefined
          : store.getBySequence(ctx.payload.afterSequence)
      return diffPolicyBundles(before, after)
    })

    const revokeApproval = Effect.fn("EnterpriseHttpApi.revokeApproval")(function* (ctx: {
      params: { tenantId: string }
      payload: { approvalId: string; actorUserId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      if (!hasPermission(state, ctx.params.tenantId, ctx.payload.actorUserId, "approval.decide")) {
        return {
          kind: "REJECTED" as const,
          reason: `actor ${ctx.payload.actorUserId} lacks approval.decide`,
        }
      }
      const result = emergencyRevokeApproval(
        ctx.params.tenantId,
        ctx.payload.approvalId,
        ctx.payload.actorUserId,
        state.approvals,
        new Date(),
      )
      if (result.kind === "DECIDED") {
        return { kind: "DECIDED" as const, status: result.record.status }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    const bulkDenyApprovals = Effect.fn("EnterpriseHttpApi.bulkDenyApprovals")(function* (ctx: {
      params: { tenantId: string }
      payload: { approvalIds: readonly string[]; actorUserId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      if (!hasPermission(state, ctx.params.tenantId, ctx.payload.actorUserId, "approval.decide")) {
        return { denied: 0, skipped: ctx.payload.approvalIds.length }
      }
      const result = bulkDeny(
        ctx.params.tenantId,
        [...ctx.payload.approvalIds],
        ctx.payload.actorUserId,
        state.approvals,
        new Date(),
      )
      return { denied: result.denied, skipped: result.skipped }
    })

    const archive = Effect.fn("EnterpriseHttpApi.archiveProof")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        proofId: string
        proofJson: string
        source: string
        retentionUntil: string
        archiveId?: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const result = archiveProof(
        {
          tenantId: ctx.params.tenantId,
          proofId: ctx.payload.proofId,
          proofJson: ctx.payload.proofJson,
          source: ctx.payload.source,
          retentionUntil: ctx.payload.retentionUntil,
          archiveId: ctx.payload.archiveId,
        },
        controlStateFor(directory).auditArchive,
      )
      if (result.kind === "ARCHIVED") {
        return { kind: "ARCHIVED" as const, record: result.record }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    const exportArchive = Effect.fn("EnterpriseHttpApi.exportArchive")(function* (ctx: {
      params: { tenantId: string; archiveId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const result = exportProof(
        ctx.params.tenantId,
        ctx.params.archiveId,
        controlStateFor(directory).auditArchive,
      )
      if (result.kind === "EXPORTED") {
        return {
          kind: "EXPORTED" as const,
          proofJson: result.proofJson,
          fingerprint: result.fingerprint,
          custody: result.custody,
        }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    const custody = Effect.fn("EnterpriseHttpApi.custody")(function* (ctx: {
      params: { tenantId: string; archiveId: string }
      payload: { who: string; action: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const result = appendCustody(
        ctx.params.tenantId,
        ctx.params.archiveId,
        { who: ctx.payload.who, action: ctx.payload.action, at: new Date().toISOString() },
        controlStateFor(directory).auditArchive,
      )
      return { ok: result.ok, reason: result.reason }
    })

    const legalHold = Effect.fn("EnterpriseHttpApi.legalHold")(function* (ctx: {
      params: { tenantId: string; archiveId: string }
      payload: { action: "PLACE" | "REMOVE" }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const store = controlStateFor(directory).auditArchive
      const result =
        ctx.payload.action === "PLACE"
          ? placeLegalHold(ctx.params.tenantId, ctx.params.archiveId, store)
          : removeLegalHold(ctx.params.tenantId, ctx.params.archiveId, store)
      return { ok: result.ok, reason: result.reason }
    })

    const retentionSweep = Effect.fn("EnterpriseHttpApi.retentionSweep")(function* (ctx: {
      params: { tenantId: string }
      payload: { now?: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const now = ctx.payload.now ? new Date(ctx.payload.now) : new Date()
      return applyRetention(ctx.params.tenantId, controlStateFor(directory).auditArchive, now)
    })

    const putAlert = Effect.fn("EnterpriseHttpApi.putAlert")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        alertId: string
        severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
        kind: string
        subjectId?: string
        detail: string
        at?: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      controlStateFor(directory).securityOps.putAlert({
        tenantId: ctx.params.tenantId,
        alertId: ctx.payload.alertId,
        severity: ctx.payload.severity,
        kind: ctx.payload.kind,
        subjectId: ctx.payload.subjectId,
        detail: ctx.payload.detail,
        at: ctx.payload.at ?? new Date().toISOString(),
      })
      return { ok: true }
    })

    const listAlerts = Effect.fn("EnterpriseHttpApi.listAlerts")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string; severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).securityOps.alerts(
        ctx.params.tenantId,
        ctx.query.severity,
      )
    })

    const appendTimeline = Effect.fn("EnterpriseHttpApi.appendTimeline")(function* (ctx: {
      params: { tenantId: string; incidentId: string }
      payload: { actor: string; event: string; at?: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      controlStateFor(directory).securityOps.appendTimeline({
        tenantId: ctx.params.tenantId,
        incidentId: ctx.params.incidentId,
        at: ctx.payload.at ?? new Date().toISOString(),
        actor: ctx.payload.actor,
        event: ctx.payload.event,
      })
      return { ok: true }
    })

    const listTimeline = Effect.fn("EnterpriseHttpApi.listTimeline")(function* (ctx: {
      params: { tenantId: string; incidentId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).securityOps.timeline(
        ctx.params.tenantId,
        ctx.params.incidentId,
      )
    })

    const revocationCampaign = Effect.fn("EnterpriseHttpApi.revocationCampaign")(function* (ctx: {
      params: { tenantId: string }
      payload: { nodeIds: readonly string[]; reason: string; actorUserId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      if (!hasPermission(state, ctx.params.tenantId, ctx.payload.actorUserId, "node.manage")) {
        return {
          kind: "REJECTED" as const,
          reason: `actor ${ctx.payload.actorUserId} lacks node.manage`,
        }
      }
      const now = new Date()
      const result = runRevocationCampaign(
        ctx.params.tenantId,
        ctx.payload.nodeIds.map((nodeId) => ({ nodeId })),
        ctx.payload.reason,
        (nodeId) => {
          if (!state.fleet.getNode(ctx.params.tenantId, nodeId)) {
            return { ok: false, reason: "node not registered" }
          }
          state.fleet.setRevoked(ctx.params.tenantId, nodeId, now.toISOString())
          state.securityOps.appendTimeline({
            tenantId: ctx.params.tenantId,
            incidentId: `revocation-campaign-${now.getTime()}`,
            at: now.toISOString(),
            actor: ctx.payload.actorUserId,
            event: `emergency revocation: ${nodeId} (${ctx.payload.reason})`,
          })
          return { ok: true }
        },
        now,
      )
      return {
        kind: "RUN" as const,
        revokedNodes: result.revokedNodes,
        auditEvents: result.auditEvents,
      }
    })

    const forensic = Effect.fn("EnterpriseHttpApi.forensicExport")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return forensicExport(ctx.params.tenantId, controlStateFor(directory).securityOps, new Date())
    })

    const checkStorable = Effect.fn("EnterpriseHttpApi.checkStorable")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        record: {
          id: string
          classification: "PUBLIC" | "INTERNAL" | "PRIVATE" | "SECRET" | "PII"
          region: string
          createdAt: string
        }
        policy?: {
          allowedRegions: readonly string[]
          customerManagedKeys: boolean
          telemetryOptOut: boolean
          piiRetentionMs: number
        }
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      void directory
      const policy = ctx.payload.policy
        ? { ...ctx.payload.policy, allowedRegions: [...ctx.payload.policy.allowedRegions] }
        : DEFAULT_DATA_GOVERNANCE_POLICY
      return assertStorable({ ...ctx.payload.record }, policy)
    })

    const checkExportable = Effect.fn("EnterpriseHttpApi.checkExportable")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        classification: "PUBLIC" | "INTERNAL" | "PRIVATE" | "SECRET" | "PII"
        policy?: {
          allowedRegions: readonly string[]
          customerManagedKeys: boolean
          telemetryOptOut: boolean
          piiRetentionMs: number
        }
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      void directory
      const policy = ctx.payload.policy
        ? { ...ctx.payload.policy, allowedRegions: [...ctx.payload.policy.allowedRegions] }
        : DEFAULT_DATA_GOVERNANCE_POLICY
      return assertExportable(
        ctx.payload.classification,
        policy,
      )
    })

    const classify = Effect.fn("EnterpriseHttpApi.classify")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        containsPii: boolean
        sensitivity: "PUBLIC" | "INTERNAL" | "PRIVATE" | "SECRET"
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      void directory
      return { classification: classifyInput(ctx.payload) }
    })

    const piiRetention = Effect.fn("EnterpriseHttpApi.piiRetention")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        records: ReadonlyArray<{
          readonly id: string
          readonly classification: "PUBLIC" | "INTERNAL" | "PRIVATE" | "SECRET" | "PII"
          readonly region: string
          readonly createdAt: string
        }>
        policy?: {
          allowedRegions: readonly string[]
          customerManagedKeys: boolean
          telemetryOptOut: boolean
          piiRetentionMs: number
        }
        now?: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      void directory
      const policy = ctx.payload.policy
        ? { ...ctx.payload.policy, allowedRegions: [...ctx.payload.policy.allowedRegions] }
        : DEFAULT_DATA_GOVERNANCE_POLICY
      return applyPiiRetention(
        ctx.payload.records.map((record) => ({ ...record })),
        policy,
        ctx.payload.now ? new Date(ctx.payload.now) : new Date(),
      )
    })

    return handlers
      .handle("createOrganization", createOrganization)
      .handle("assignRole", assignRole)
      .handle("fleet", fleet)
      .handle("createApproval", createApproval)
      .handle("decideApproval", decide)
      .handle("audit", audit)
      .handle("registerNode", registerNode)
      .handle("heartbeat", heartbeat)
      .handle("promotePolicy", promotePolicy)
      .handle("diffPolicy", diffPolicy)
      .handle("revokeApproval", revokeApproval)
      .handle("bulkDenyApprovals", bulkDenyApprovals)
      .handle("archiveProof", archive)
      .handle("exportArchive", exportArchive)
      .handle("custody", custody)
      .handle("legalHold", legalHold)
      .handle("retentionSweep", retentionSweep)
      .handle("putAlert", putAlert)
      .handle("listAlerts", listAlerts)
      .handle("appendTimeline", appendTimeline)
      .handle("listTimeline", listTimeline)
      .handle("revocationCampaign", revocationCampaign)
      .handle("forensicExport", forensic)
      .handle("checkStorable", checkStorable)
      .handle("checkExportable", checkExportable)
      .handle("classify", classify)
      .handle("piiRetention", piiRetention)
  }),
)
