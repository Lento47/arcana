import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { fleetView } from "@arcana/core/enterprise/fleet"
import {
  decideApproval,
  type CentralApprovalRecord,
} from "@arcana/core/enterprise/approvals"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import { controlStateFor } from "./control-state"

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

    return handlers
      .handle("createOrganization", createOrganization)
      .handle("assignRole", assignRole)
      .handle("fleet", fleet)
      .handle("createApproval", createApproval)
      .handle("decideApproval", decide)
      .handle("audit", audit)
  }),
)
