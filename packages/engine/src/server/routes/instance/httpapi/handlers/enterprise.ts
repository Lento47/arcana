import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { deriveFleetHealth, fleetView, nodeDiagnostics } from "@arcana/core/enterprise/fleet"
import {
  decideApproval,
  type CentralApprovalRecord,
} from "@arcana/core/enterprise/approvals"
import { bulkDeny, emergencyRevokeApproval } from "@arcana/core/enterprise/approvals"
import { authorizeAdminAction, type Permission } from "@arcana/core/enterprise/identity"
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
import { escalateApproval, type EscalationPolicy } from "@arcana/core/enterprise/escalation"
import { quotaStatus, type UsageEvent } from "@arcana/core/enterprise/metering"
import { siemCef } from "@arcana/core/enterprise/siem-export"
import type { AdminEvent } from "@arcana/core/enterprise/admin-events"
import { routeCrossOrgApproval } from "@arcana/core/enterprise/federation-approvals"
import { planRingRollout, type UpgradeRing } from "@arcana/core/enterprise/upgrade-rings"
import { validatePolicyDraft } from "@arcana/core/enterprise/policy-drafts"
import { detectAnomalies } from "@arcana/core/enterprise/anomaly"
import { toTicketPayload } from "@arcana/core/enterprise/ticketing"
import {
  queueRevocationDelivery,
  receiveRevocationDelivery,
} from "@arcana/core/enterprise/federation-transport"
import {
  deliverPendingWebhooks,
  enqueueWebhookDeliveries,
  type WebhookEndpoint,
} from "@arcana/core/enterprise/webhooks"
import type { SignedPolicyEnvelope } from "@arcana/core/crypto/signed-envelopes"
import { SignedPolicyEnvelopeSchema } from "../groups/policy"
import {
  DEFAULT_RELIABILITY_CONFIG,
  evaluateDrill,
  restoreBackup,
  type BackupRecord,
  type DrillRecord,
} from "@arcana/core/enterprise/reliability"
import {
  exchangeProof,
  intersectAuthority,
  propagateRevocation,
} from "@arcana/core/enterprise/federation"
import {
  DEFAULT_UPGRADE_POLICY,
  entitled,
  meteringNeverAffectsDecision,
  redactDiagnostics,
} from "@arcana/core/enterprise/commercial-readiness"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import {
  controlStateFor,
  issuerContext,
  policyTargetStoreFor,
  type ControlPlaneState,
} from "./control-state"
import { ForbiddenError } from "../errors"
import { AdminPrincipal } from "../middleware/authorization"

/**
 * Resolve the authenticated admin principal from the server context,
 * attached by the authorization middleware after credential validation:
 * Basic auth username when the server requires auth, otherwise the trusted
 * local runtime context. Client-supplied actor fields never participate.
 */
const adminPrincipal = Effect.fn("EnterpriseHttpApi.adminPrincipal")(function* () {
  const principal = Option.getOrUndefined(yield* Effect.serviceOption(AdminPrincipal))
  if (principal) {
    return { userId: principal.userId, authenticatedAt: principal.authenticatedAt }
  }
  // Defensive fallback: the group always runs the authorization middleware,
  // so this branch is unreachable in the mounted surface.
  return { userId: "local-operator", authenticatedAt: new Date().toISOString() }
})

/**
 * Tenant authority gate: the path tenant is a selector, never a grant. The
 * authenticated principal must be bound to the tenant by a server-side role
 * assignment, otherwise the mutation is rejected with 403 (fail closed).
 */
const gateTenant = Effect.fn("EnterpriseHttpApi.gateTenant")(function* (ctx: {
  state: ControlPlaneState
  tenantId: string
}) {
  const principal = yield* adminPrincipal()
  if (ctx.state.identity.rolesFor(ctx.tenantId, principal.userId).length === 0) {
    return yield* Effect.fail(
      new ForbiddenError({
        message: `principal ${principal.userId} is not bound to tenant ${ctx.tenantId}`,
      }),
    )
  }
  return principal
})

/**
 * Admin mutation gate: tenant binding plus the RBAC permission decision for
 * the AUTHENTICATED principal. Client-supplied actor identity is never
 * consulted, so forged actorUserId/approvedBy/operatorId body fields can
 * neither grant authority nor change audit attribution.
 */
const gateAdmin = Effect.fn("EnterpriseHttpApi.gateAdmin")(function* (ctx: {
  state: ControlPlaneState
  tenantId: string
  action: Permission
}) {
  const principal = yield* gateTenant(ctx)
  const decision = authorizeAdminAction({
    tenantId: ctx.tenantId,
    userId: principal.userId,
    action: ctx.action,
    active: ctx.state.identity.isUserActive(ctx.tenantId, principal.userId),
    roles: ctx.state.identity.rolesFor(ctx.tenantId, principal.userId),
  })
  if (!decision.allowed) {
    return yield* Effect.fail(new ForbiddenError({ message: decision.reason }))
  }
  return principal
})

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
      const principal = yield* adminPrincipal()
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      // A client cannot claim an existing tenant: creating an organization
      // fails closed when the tenant id already exists.
      if (state.tenants.getOrganization(ctx.payload.tenantId)) {
        return yield* Effect.fail(
          new ForbiddenError({ message: `tenant ${ctx.payload.tenantId} already exists` }),
        )
      }
      const now = new Date().toISOString()
      const org = { tenantId: ctx.payload.tenantId, id: `org-${ctx.payload.tenantId}`, name: ctx.payload.name, createdAt: now }
      state.tenants.putOrganization(org)
      // Authority in the new tenant derives from the authenticated
      // principal: the server binds the creator as OWNER; a body claim
      // grants nothing.
      state.identity.assignRole({
        tenantId: ctx.payload.tenantId,
        userId: principal.userId,
        role: "OWNER",
        assignedAt: now,
      })
      return org
    })

    const assignRole = Effect.fn("EnterpriseHttpApi.assignRole")(function* (ctx: {
      params: { tenantId: string }
      payload: { userId: string; role: "OWNER" | "ADMIN" | "OPERATOR" | "AUDITOR" | "MEMBER" }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      const principal = yield* gateAdmin({
        state,
        tenantId: ctx.params.tenantId,
        action: "identity.manage",
      })
      void principal
      state.identity.assignRole({
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
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
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
      state.approvals.put(record)
      return true
    })

    const decide = Effect.fn("EnterpriseHttpApi.decideApproval")(function* (ctx: {
      params: { tenantId: string; approvalId: string }
      payload: {
        decision: "APPROVE" | "DENY"
        inspectedRequestJson?: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      const principal = yield* gateAdmin({
        state,
        tenantId: ctx.params.tenantId,
        action: "approval.decide",
      })
      const record = state.approvals.get(ctx.params.tenantId, ctx.params.approvalId)
      if (!record) {
        return { kind: "REJECTED" as const, reason: "approval not found" }
      }
      const result = decideApproval(record, {
        actorUserId: principal.userId,
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
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const now = new Date().toISOString()
      state.fleet.putNode({
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
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      state.fleet.updateHeartbeat(ctx.params.tenantId, ctx.params.nodeId, {
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
      const principal = yield* gateAdmin({
        state,
        tenantId: ctx.params.tenantId,
        action: "policy.publish",
      })
      const result = promotePolicyBundle(
        {
          tenantId: ctx.params.tenantId,
          sourceStore: state.policyStore,
          targetStore: policyTargetStoreFor(directory, ctx.payload.targetEnvironment),
          sourceSequence: ctx.payload.sourceSequence,
          targetEnvironment: ctx.payload.targetEnvironment,
          // Attribution is the authenticated principal: forged
          // requestedBy/approvedBy body fields are ignored.
          requestedBy: principal.userId,
          approvedBy: principal.userId,
          approverHasPermission: true,
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
      payload: { approvalId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      const principal = yield* gateAdmin({
        state,
        tenantId: ctx.params.tenantId,
        action: "approval.decide",
      })
      const result = emergencyRevokeApproval(
        ctx.params.tenantId,
        ctx.payload.approvalId,
        principal.userId,
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
      payload: { approvalIds: readonly string[] }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      const principal = yield* gateAdmin({
        state,
        tenantId: ctx.params.tenantId,
        action: "approval.decide",
      })
      const result = bulkDeny(
        ctx.params.tenantId,
        [...ctx.payload.approvalIds],
        principal.userId,
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
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const result = archiveProof(
        {
          tenantId: ctx.params.tenantId,
          proofId: ctx.payload.proofId,
          proofJson: ctx.payload.proofJson,
          source: ctx.payload.source,
          retentionUntil: ctx.payload.retentionUntil,
          archiveId: ctx.payload.archiveId,
        },
        state.auditArchive,
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
      payload: { action: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      const principal = yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const result = appendCustody(
        ctx.params.tenantId,
        ctx.params.archiveId,
        { who: principal.userId, action: ctx.payload.action, at: new Date().toISOString() },
        state.auditArchive,
      )
      return { ok: result.ok, reason: result.reason }
    })

    const legalHold = Effect.fn("EnterpriseHttpApi.legalHold")(function* (ctx: {
      params: { tenantId: string; archiveId: string }
      payload: { action: "PLACE" | "REMOVE" }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const store = state.auditArchive
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
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const now = ctx.payload.now ? new Date(ctx.payload.now) : new Date()
      return applyRetention(ctx.params.tenantId, state.auditArchive, now)
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
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      state.securityOps.putAlert({
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
      payload: { event: string; at?: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      const principal = yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      state.securityOps.appendTimeline({
        tenantId: ctx.params.tenantId,
        incidentId: ctx.params.incidentId,
        at: ctx.payload.at ?? new Date().toISOString(),
        actor: principal.userId,
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
      payload: { nodeIds: readonly string[]; reason: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      const principal = yield* gateAdmin({
        state,
        tenantId: ctx.params.tenantId,
        action: "node.manage",
      })
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
            actor: principal.userId,
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

    const backup = Effect.fn("EnterpriseHttpApi.backup")(function* (ctx: {
      params: { tenantId: string }
      payload: { backupId: string; kind: "DATABASE" | "KEYS"; digest: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const record: BackupRecord = {
        tenantId: ctx.params.tenantId,
        backupId: ctx.payload.backupId,
        kind: ctx.payload.kind,
        createdAt: new Date().toISOString(),
        digest: ctx.payload.digest,
      }
      state.reliability.putBackup(record)
      return record
    })

    const restore = Effect.fn("EnterpriseHttpApi.restore")(function* (ctx: {
      params: { tenantId: string; backupId: string }
      payload: { presentedDigest: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const result = restoreBackup(
        ctx.params.tenantId,
        ctx.params.backupId,
        ctx.payload.presentedDigest,
        state.reliability,
      )
      if (result.kind === "RESTORED") {
        return { kind: "RESTORED" as const, record: result.record }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    const drill = Effect.fn("EnterpriseHttpApi.drill")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        drillId: string
        startedAt: string
        finishedAt: string
        restoredDigest: string
        measuredRpoMs: number
        measuredRtoMs: number
        config?: {
          availabilityTarget: number
          rpoMs: number
          rtoMs: number
        }
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const record: DrillRecord = {
        tenantId: ctx.params.tenantId,
        drillId: ctx.payload.drillId,
        startedAt: ctx.payload.startedAt,
        finishedAt: ctx.payload.finishedAt,
        restoredDigest: ctx.payload.restoredDigest,
        measuredRpoMs: ctx.payload.measuredRpoMs,
        measuredRtoMs: ctx.payload.measuredRtoMs,
      }
      state.reliability.recordDrill(record)
      const result = evaluateDrill(record, ctx.payload.config ?? DEFAULT_RELIABILITY_CONFIG)
      return { result, record }
    })

    const drills = Effect.fn("EnterpriseHttpApi.drills")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).reliability.drills(ctx.params.tenantId)
    })

    const putFederationAgreement = Effect.fn("EnterpriseHttpApi.putFederationAgreement")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        agreementId: string
        version: number
        orgA: string
        orgB: string
        audienceRestrictions: readonly string[]
        validFrom: string
        validTo: string
        status: "ACTIVE" | "REVOKED"
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const agreement = {
        ...ctx.payload,
        audienceRestrictions: [...ctx.payload.audienceRestrictions],
      }
      state.federation.putAgreement(agreement)
      return agreement
    })

    const getFederationAgreement = Effect.fn("EnterpriseHttpApi.getFederationAgreement")(function* (ctx: {
      params: { tenantId: string; agreementId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).federation.getAgreement(ctx.params.agreementId) ?? null
    })

    const federationExchange = Effect.fn("EnterpriseHttpApi.federationExchange")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        agreementId: string
        orgId: string
        remoteProofId: string
        fingerprint: string
        origin: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const result = exchangeProof(
        {
          agreementId: ctx.payload.agreementId,
          orgId: ctx.payload.orgId,
          remoteProofId: ctx.payload.remoteProofId,
          fingerprint: ctx.payload.fingerprint,
          origin: ctx.payload.origin,
          now: new Date(),
        },
        state.federation,
      )
      if (result.kind === "EXCHANGED") {
        return { kind: "EXCHANGED" as const, record: result.record }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    const federationRevoke = Effect.fn("EnterpriseHttpApi.federationRevoke")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        agreementId: string
        orgId: string
        subjectId: string
        reason: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const result = propagateRevocation(
        {
          agreementId: ctx.payload.agreementId,
          orgId: ctx.payload.orgId,
          subjectId: ctx.payload.subjectId,
          reason: ctx.payload.reason,
          now: new Date(),
        },
        state.federation,
      )
      if ("kind" in result) return result
      return result
    })

    const federationExchanges = Effect.fn("EnterpriseHttpApi.federationExchanges")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string; orgId?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).federation.exchanges(ctx.query.orgId ?? ctx.params.tenantId)
    })

    const federationRevocations = Effect.fn("EnterpriseHttpApi.federationRevocations")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string; orgId?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).federation.revocations(ctx.query.orgId ?? ctx.params.tenantId)
    })

    const federationIntersect = Effect.fn("EnterpriseHttpApi.federationIntersect")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        agreementId: string
        localActions: readonly string[]
        localResources: readonly string[]
        remoteActions: readonly string[]
        remoteResources: readonly string[]
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const result = intersectAuthority(
        { actions: new Set(ctx.payload.localActions), resources: new Set(ctx.payload.localResources) },
        { actions: new Set(ctx.payload.remoteActions), resources: new Set(ctx.payload.remoteResources) },
        controlStateFor(directory).federation.getAgreement(ctx.payload.agreementId),
        new Date(),
      )
      if (result.allowed) {
        return {
          allowed: true as const,
          scope: { actions: [...result.scope.actions], resources: [...result.scope.resources] },
        }
      }
      return { allowed: false as const, reason: result.reason }
    })

    const entitlement = Effect.fn("EnterpriseHttpApi.entitlement")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        tier: "COMMUNITY" | "TEAM" | "ENTERPRISE"
        feature:
          | "local_runtime"
          | "shared_policy"
          | "shared_approvals"
          | "fleet_control"
          | "sso"
          | "federation"
          | "compliance_exports"
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      void directory
      return { entitled: entitled(ctx.payload.tier, ctx.payload.feature) }
    })

    const meteringCheck = Effect.fn("EnterpriseHttpApi.meteringCheck")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL"
        meteringOk: boolean
        overQuota?: boolean
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      void directory
      return {
        decision: meteringNeverAffectsDecision(ctx.payload.decision, {
          ok: ctx.payload.meteringOk,
          overQuota: ctx.payload.overQuota,
        }),
      }
    })

    const diagnostics = Effect.fn("EnterpriseHttpApi.diagnostics")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        diagnostics: {
          version: string
          runtime: Readonly<Record<string, string>>
          config: Readonly<Record<string, string>>
          logs: readonly string[]
        }
        secretFragments: readonly string[]
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      void directory
      return redactDiagnostics(
        {
          version: ctx.payload.diagnostics.version,
          runtime: { ...ctx.payload.diagnostics.runtime },
          config: { ...ctx.payload.diagnostics.config },
          logs: [...ctx.payload.diagnostics.logs],
        },
        ctx.payload.secretFragments,
      )
    })

    const upgradePolicy = Effect.fn("EnterpriseHttpApi.upgradePolicy")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      void directory
      return DEFAULT_UPGRADE_POLICY
    })

    const nodeDetail = Effect.fn("EnterpriseHttpApi.nodeDetail")(function* (ctx: {
      params: { tenantId: string; nodeId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return (
        nodeDiagnostics(
          controlStateFor(directory).fleet,
          ctx.params.tenantId,
          ctx.params.nodeId,
          new Date(),
        ) ?? null
      )
    })

    const putEscalationPolicy = Effect.fn("EnterpriseHttpApi.putEscalationPolicy")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        policyId: string
        maxWaitMs: number
        fallbackApprovers: readonly string[]
        requireBreakGlass: boolean
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const policy: EscalationPolicy = {
        tenantId: ctx.params.tenantId,
        policyId: ctx.payload.policyId,
        maxWaitMs: ctx.payload.maxWaitMs,
        fallbackApprovers: [...ctx.payload.fallbackApprovers],
        requireBreakGlass: ctx.payload.requireBreakGlass,
      }
      state.escalations.putPolicy(policy)
      return policy
    })

    const getEscalationPolicy = Effect.fn("EnterpriseHttpApi.getEscalationPolicy")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).escalations.getPolicy(ctx.params.tenantId) ?? null
    })

    const escalationCheck = Effect.fn("EnterpriseHttpApi.escalationCheck")(function* (ctx: {
      params: { tenantId: string }
      payload: { approvalId: string; now?: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const approval = state.approvals.get(ctx.params.tenantId, ctx.payload.approvalId)
      if (!approval) {
        return { escalated: false as const, reason: "approval not found" }
      }
      const now = ctx.payload.now ? new Date(ctx.payload.now) : new Date()
      return escalateApproval(
        ctx.params.tenantId,
        approval,
        state.escalations.getPolicy(ctx.params.tenantId),
        state.escalations,
        now,
      )
    })

    const escalationEvents = Effect.fn("EnterpriseHttpApi.escalationEvents")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).escalations.events(ctx.params.tenantId)
    })

    const putAdminEvent = Effect.fn("EnterpriseHttpApi.putAdminEvent")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        kind: "approval.pending" | "node.revoked" | "policy.promoted" | "alert.critical"
        approvalId?: string
        requestHash?: string
        nodeId?: string
        reason?: string
        policyId?: string
        sequence?: number
        alertId?: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const recordedAt = new Date().toISOString()
      const event = {
        ...ctx.payload,
        tenantId: ctx.params.tenantId,
        at: recordedAt,
      } as unknown as AdminEvent
      const record = { ...event, recordedAt }
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      state.adminEvents.put(record)
      enqueueWebhookDeliveries(
        ctx.params.tenantId,
        record,
        state.webhooks.listEndpoints(ctx.params.tenantId),
        state.webhooks,
        new Date(),
      )
      return record
    })

    const listAdminEvents = Effect.fn("EnterpriseHttpApi.listAdminEvents")(function* (ctx: {
      params: { tenantId: string }
      query: {
        directory?: string
        kind?: "approval.pending" | "node.revoked" | "policy.promoted" | "alert.critical"
        since?: string
      }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).adminEvents.list(ctx.params.tenantId, {
        kind: ctx.query.kind,
        since: ctx.query.since,
      })
    })

    const siemExport = Effect.fn("EnterpriseHttpApi.siemExport")(function* (ctx: {
      params: { tenantId: string }
      query: {
        directory?: string
        kind?: "approval.pending" | "node.revoked" | "policy.promoted" | "alert.critical"
        since?: string
      }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const events = controlStateFor(directory).adminEvents.list(ctx.params.tenantId, {
        kind: ctx.query.kind,
        since: ctx.query.since,
      })
      return siemCef(events)
    })

    const putUsage = Effect.fn("EnterpriseHttpApi.putUsage")(function* (ctx: {
      params: { tenantId: string }
      payload: { eventId: string; feature: string; units: number; at?: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const event: UsageEvent = {
        tenantId: ctx.params.tenantId,
        eventId: ctx.payload.eventId,
        feature: ctx.payload.feature,
        units: ctx.payload.units,
        at: ctx.payload.at ?? new Date().toISOString(),
      }
      state.metering.putUsage(event)
      return event
    })

    const getUsage = Effect.fn("EnterpriseHttpApi.getUsage")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string; feature?: string; since?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const store = controlStateFor(directory).metering
      if (ctx.query.feature) {
        const units = store.usage(
          ctx.params.tenantId,
          ctx.query.feature,
          ctx.query.since ?? "1970-01-01T00:00:00.000Z",
        )
        return { kind: "summary" as const, feature: ctx.query.feature, units }
      }
      return { kind: "events" as const, events: store.allUsage(ctx.params.tenantId) }
    })

    const usageQuota = Effect.fn("EnterpriseHttpApi.usageQuota")(function* (ctx: {
      params: { tenantId: string }
      payload: { limit: number; feature: string; since?: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const used = controlStateFor(directory).metering.usage(
        ctx.params.tenantId,
        ctx.payload.feature,
        ctx.payload.since ?? "1970-01-01T00:00:00.000Z",
      )
      return quotaStatus(ctx.payload.limit, used)
    })

    const usageExport = Effect.fn("EnterpriseHttpApi.usageExport")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const events = controlStateFor(directory).metering.allUsage(ctx.params.tenantId)
      const totals = new Map<string, number>()
      for (const event of events) {
        totals.set(event.feature, (totals.get(event.feature) ?? 0) + event.units)
      }
      return [...totals.entries()]
        .map(([feature, units]) => ({ feature, units }))
        .sort((a, b) => a.feature.localeCompare(b.feature))
    })

    const putFederationRule = Effect.fn("EnterpriseHttpApi.putFederationRule")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        ruleId: string
        orgB: string
        agreementId: string
        actionPatterns: readonly string[]
        maxPerDay: number
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const rule = {
        ruleId: ctx.payload.ruleId,
        orgA: ctx.params.tenantId,
        orgB: ctx.payload.orgB,
        agreementId: ctx.payload.agreementId,
        actionPatterns: [...ctx.payload.actionPatterns],
        maxPerDay: ctx.payload.maxPerDay,
      }
      state.crossOrgApprovals.putRule(rule)
      return rule
    })

    const listFederationRules = Effect.fn("EnterpriseHttpApi.listFederationRules")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).crossOrgApprovals.listRules(ctx.params.tenantId)
    })

    const routeCrossOrgApprovalHandler = Effect.fn("EnterpriseHttpApi.routeCrossOrgApproval")(
      function* (ctx: {
        params: { tenantId: string }
        payload: { orgB: string; agreementId: string; approvalId: string; action: string }
        query: { directory?: string }
      }) {
        const directory = yield* resolveDirectory(ctx.query.directory)
        const state = controlStateFor(directory)
        yield* gateTenant({ state, tenantId: ctx.params.tenantId })
        const result = routeCrossOrgApproval(
          {
            orgA: ctx.params.tenantId,
            orgB: ctx.payload.orgB,
            agreementId: ctx.payload.agreementId,
            approvalId: ctx.payload.approvalId,
            action: ctx.payload.action,
            now: new Date(),
          },
          state.federation,
          state.crossOrgApprovals,
        )
        if (result.kind === "ROUTED") {
          return { kind: "ROUTED" as const, record: result.record, rule: result.rule }
        }
        return { kind: "REJECTED" as const, reason: result.reason }
      },
    )

    const listRoutedApprovals = Effect.fn("EnterpriseHttpApi.listRoutedApprovals")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string; orgId?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).crossOrgApprovals.routedSince(
        ctx.query.orgId ?? ctx.params.tenantId,
        "1970-01-01T00:00:00.000Z",
      )
    })

    const putUpgradeRing = Effect.fn("EnterpriseHttpApi.putUpgradeRing")(function* (ctx: {
      params: { tenantId: string }
      payload: { ringId: string; name: string; targetVersion: string; paused: boolean }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const ring: UpgradeRing = {
        tenantId: ctx.params.tenantId,
        ringId: ctx.payload.ringId,
        name: ctx.payload.name,
        targetVersion: ctx.payload.targetVersion,
        paused: ctx.payload.paused,
        createdAt: new Date().toISOString(),
      }
      state.upgradeRings.putRing(ring)
      return ring
    })

    const listUpgradeRings = Effect.fn("EnterpriseHttpApi.listUpgradeRings")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).upgradeRings.listRings(ctx.params.tenantId)
    })

    const assignRingNode = Effect.fn("EnterpriseHttpApi.assignRingNode")(function* (ctx: {
      params: { tenantId: string; ringId: string }
      payload: { nodeId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      if (!state.upgradeRings.getRing(ctx.params.tenantId, ctx.params.ringId)) {
        return { ok: false, reason: "ring not found" }
      }
      state.upgradeRings.assignNode({
        tenantId: ctx.params.tenantId,
        nodeId: ctx.payload.nodeId,
        ringId: ctx.params.ringId,
        assignedAt: new Date().toISOString(),
      })
      return { ok: true }
    })

    const ringPlan = Effect.fn("EnterpriseHttpApi.ringPlan")(function* (ctx: {
      params: { tenantId: string; ringId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      const ring = state.upgradeRings.getRing(ctx.params.tenantId, ctx.params.ringId)
      if (!ring) return []
      const now = new Date()
      const nodes = state.fleet
        .listNodes(ctx.params.tenantId)
        .filter(
          (node) =>
            state.upgradeRings.nodeRing(ctx.params.tenantId, node.nodeId)?.ringId ===
            ctx.params.ringId,
        )
        .map((node) => ({
          nodeId: node.nodeId,
          version: node.version,
          enforcementMode: node.enforcementMode,
          health: deriveFleetHealth(node, now),
        }))
      return planRingRollout(ring, nodes)
    })

    const validateDraft = Effect.fn("EnterpriseHttpApi.validatePolicyDraft")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        envelope: typeof SignedPolicyEnvelopeSchema.Type
        activationTime?: string
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const issuer = issuerContext()
      if (!issuer.ok) {
        return { valid: false as const, reason: `issuer not configured: ${issuer.reason}` }
      }
      const result = validatePolicyDraft(
        ctx.payload.envelope as unknown as SignedPolicyEnvelope,
        controlStateFor(directory).policyStore.history(),
        issuer.context.issuerPublicKeys,
        ctx.payload.activationTime ? new Date(ctx.payload.activationTime) : new Date(),
      )
      if (result.valid) {
        return { valid: true as const, record: result.record }
      }
      return { valid: false as const, reason: result.reason }
    })

    const anomalyScan = Effect.fn("EnterpriseHttpApi.anomalyScan")(function* (ctx: {
      params: { tenantId: string }
      payload: {
        alertsLastHour: number
        revocationsLastHour: number
        maxProofBacklog: number
        staleNodeCount: number
        totalNodeCount: number
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const signals = detectAnomalies({ ...ctx.payload, tenantId: ctx.params.tenantId })
      for (const signal of signals) {
        state.securityOps.putAlert({
          tenantId: signal.tenantId,
          alertId: signal.signalId,
          severity: signal.severity,
          kind: `anomaly.${signal.kind}`,
          detail: signal.detail,
          at: signal.at,
        })
      }
      return signals
    })

    const ticketingExport = Effect.fn("EnterpriseHttpApi.ticketingExport")(function* (ctx: {
      params: { tenantId: string }
      query: {
        directory?: string
        kind?: "approval.pending" | "node.revoked" | "policy.promoted" | "alert.critical"
        since?: string
      }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const events = controlStateFor(directory).adminEvents.list(ctx.params.tenantId, {
        kind: ctx.query.kind,
        since: ctx.query.since,
      })
      return events.map((event) => toTicketPayload(event))
    })

    const queueDelivery = Effect.fn("EnterpriseHttpApi.queueRevocationDelivery")(function* (ctx: {
      params: { tenantId: string }
      payload: { agreementId: string; subjectId: string; reason: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const result = queueRevocationDelivery(
        {
          orgId: ctx.params.tenantId,
          agreementId: ctx.payload.agreementId,
          subjectId: ctx.payload.subjectId,
          reason: ctx.payload.reason,
          now: new Date(),
        },
        state.federation,
        state.federationTransport,
      )
      if (result.kind === "QUEUED") {
        return { kind: "QUEUED" as const, record: result.record }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    const listOutbox = Effect.fn("EnterpriseHttpApi.listRevocationOutbox")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).federationTransport.pending(ctx.params.tenantId)
    })

    const receiveDelivery = Effect.fn("EnterpriseHttpApi.receiveRevocationDelivery")(function* (ctx: {
      params: { tenantId: string }
      payload: { agreementId: string; senderOrgId: string; subjectId: string; reason: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const result = receiveRevocationDelivery(
        {
          orgId: ctx.params.tenantId,
          agreementId: ctx.payload.agreementId,
          senderOrgId: ctx.payload.senderOrgId,
          subjectId: ctx.payload.subjectId,
          reason: ctx.payload.reason,
          now: new Date(),
        },
        state.federation,
        state.federationTransport,
      )
      if (result.kind === "RECEIVED") {
        return { kind: "RECEIVED" as const, record: result.record }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    const listInbox = Effect.fn("EnterpriseHttpApi.listRevocationInbox")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).federationTransport.received(ctx.params.tenantId)
    })

    const markDelivered = Effect.fn("EnterpriseHttpApi.markRevocationDelivered")(function* (ctx: {
      params: { tenantId: string; deliveryId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      state.federationTransport.markDelivered(
        ctx.params.tenantId,
        ctx.params.deliveryId,
        new Date().toISOString(),
      )
      return { ok: true }
    })

    const putWebhook = Effect.fn("EnterpriseHttpApi.putWebhook")(function* (ctx: {
      params: { tenantId: string }
      payload: { webhookId: string; url: string; active: boolean }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const endpoint: WebhookEndpoint = {
        tenantId: ctx.params.tenantId,
        webhookId: ctx.payload.webhookId,
        url: ctx.payload.url,
        active: ctx.payload.active,
        createdAt: new Date().toISOString(),
      }
      state.webhooks.putEndpoint(endpoint)
      return endpoint
    })

    const listWebhooks = Effect.fn("EnterpriseHttpApi.listWebhooks")(function* (ctx: {
      params: { tenantId: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).webhooks.listEndpoints(ctx.params.tenantId)
    })

    const listWebhookDeliveries = Effect.fn("EnterpriseHttpApi.listWebhookDeliveries")(
      function* (ctx: {
        params: { tenantId: string }
        query: { directory?: string }
      }) {
        const directory = yield* resolveDirectory(ctx.query.directory)
        return controlStateFor(directory).webhooks.deliveries(ctx.params.tenantId)
      },
    )

    const deliverWebhooks = Effect.fn("EnterpriseHttpApi.deliverWebhooks")(function* (ctx: {
      params: { tenantId: string }
      payload: { maxAttempts?: number }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      yield* gateTenant({ state, tenantId: ctx.params.tenantId })
      const store = state.webhooks
      const deliver = async (url: string, payloadJson: string) => {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: payloadJson,
          })
          return { ok: response.ok, status: response.status }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
      }
      return yield* Effect.promise(() =>
        deliverPendingWebhooks(
          ctx.params.tenantId,
          store,
          new Date(),
          deliver,
          ctx.payload.maxAttempts,
        ),
      )
    })

    const listApprovals = Effect.fn("EnterpriseHttpApi.listApprovals")(function* (ctx: {
      params: { tenantId: string }
      query: {
        directory?: string
        status?: "PENDING" | "APPROVED" | "DENIED" | "CLAIMED" | "CONSUMED" | "EXPIRED" | "INVALIDATED"
      }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const store = controlStateFor(directory).approvals
      return ctx.query.status
        ? store.list(ctx.params.tenantId, ctx.query.status)
        : store.all(ctx.params.tenantId)
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
      .handle("backup", backup)
      .handle("restore", restore)
      .handle("drill", drill)
      .handle("drills", drills)
      .handle("putFederationAgreement", putFederationAgreement)
      .handle("getFederationAgreement", getFederationAgreement)
      .handle("federationExchange", federationExchange)
      .handle("federationRevoke", federationRevoke)
      .handle("federationExchanges", federationExchanges)
      .handle("federationRevocations", federationRevocations)
      .handle("federationIntersect", federationIntersect)
      .handle("entitlement", entitlement)
      .handle("meteringCheck", meteringCheck)
      .handle("diagnostics", diagnostics)
      .handle("upgradePolicy", upgradePolicy)
      .handle("nodeDetail", nodeDetail)
      .handle("putEscalationPolicy", putEscalationPolicy)
      .handle("getEscalationPolicy", getEscalationPolicy)
      .handle("escalationCheck", escalationCheck)
      .handle("escalationEvents", escalationEvents)
      .handle("putAdminEvent", putAdminEvent)
      .handle("listAdminEvents", listAdminEvents)
      .handle("siemExport", siemExport)
      .handle("putUsage", putUsage)
      .handle("getUsage", getUsage)
      .handle("usageQuota", usageQuota)
      .handle("usageExport", usageExport)
      .handle("putFederationRule", putFederationRule)
      .handle("listFederationRules", listFederationRules)
      .handle("routeCrossOrgApproval", routeCrossOrgApprovalHandler)
      .handle("listRoutedApprovals", listRoutedApprovals)
      .handle("putUpgradeRing", putUpgradeRing)
      .handle("listUpgradeRings", listUpgradeRings)
      .handle("assignRingNode", assignRingNode)
      .handle("ringPlan", ringPlan)
      .handle("validatePolicyDraft", validateDraft)
      .handle("anomalyScan", anomalyScan)
      .handle("ticketingExport", ticketingExport)
      .handle("queueRevocationDelivery", queueDelivery)
      .handle("listRevocationOutbox", listOutbox)
      .handle("receiveRevocationDelivery", receiveDelivery)
      .handle("listRevocationInbox", listInbox)
      .handle("markRevocationDelivered", markDelivered)
      .handle("putWebhook", putWebhook)
      .handle("listWebhooks", listWebhooks)
      .handle("listWebhookDeliveries", listWebhookDeliveries)
      .handle("deliverWebhooks", deliverWebhooks)
      .handle("listApprovals", listApprovals)
  }),
)
