/**
 * Runtime API: the narrow durable contract consumed by Arcana Desktop and by
 * workspace-scoped operators.
 *
 * The sidecar and Desktop never own authority. These endpoints read durable
 * approval/session/proof state and submit operator commands through the SAME
 * runtime service as the CLI/TUI (submitApprovalCommand). Approval commands
 * never trust a client-supplied operator identity: the operator is derived
 * from the authenticated server context (Basic auth username when auth is
 * required, otherwise the local runtime context).
 */

import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"
import { ApprovalCommandFailure, ApprovalCommandSuccess } from "./approval"
import { ApprovalRecordSchema } from "@/approval/events"
import { SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { RunProofSnapshot } from "./session"
import { ApiNotFoundError } from "../errors"
import { ApprovalAffordanceQuery, AuthorityAffordanceSchema } from "./affordance"

const root = ""

export const RuntimePaths = {
  approvals: `${root}/approvals`,
  approval: `${root}/approvals/:approvalID`,
  affordances: `${root}/approvals/:approvalID/affordances`,
  approve: `${root}/approvals/:approvalID/approve`,
  deny: `${root}/approvals/:approvalID/deny`,
  revoke: `${root}/approvals/:approvalID/revoke`,
  sessions: `${root}/sessions`,
  session: `${root}/sessions/:sessionID`,
  proof: `${root}/proofs/:sessionID`,
  desktopHeartbeat: `${root}/desktop/heartbeat`,
} as const

export const RuntimeApprovalCommandPayload = Schema.Struct({
  expectedVersion: Schema.Int,
  expectedRequestHash: Schema.String,
  expectedContractRevision: Schema.Int,
})

export const RuntimeApprovalCommandResponse = Schema.Union([ApprovalCommandSuccess, ApprovalCommandFailure])

export const DesktopHeartbeatPayload = Schema.Struct({
  subscriberId: Schema.String,
  deploymentMode: Schema.optional(Schema.Literals(["LOCAL", "HYBRID", "ENTERPRISE"])),
})

export const DesktopHeartbeatResult = Schema.Struct({
  subscriberId: Schema.String,
  workspaceId: Schema.String,
  expiresAt: Schema.String,
  ttlMs: Schema.Number,
})

export const RuntimeApi = HttpApi.make("runtime").add(
  HttpApiGroup.make("runtime")
    .add(
      HttpApiEndpoint.get("listApprovals", RuntimePaths.approvals, {
        query: WorkspaceRoutingQuery,
        success: described(Schema.Array(ApprovalRecordSchema), "Approval records in this workspace"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "runtime.approvals.list",
          summary: "List approvals",
          description:
            "All durable approval records for the routed workspace. The approval store is per-workspace, so the list is naturally scoped to this runtime.",
        }),
      ),
      HttpApiEndpoint.get("getApproval", RuntimePaths.approval, {
        params: { approvalID: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(ApprovalRecordSchema, "Approval record"),
        error: [HttpApiError.BadRequest, ApiNotFoundError],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "runtime.approvals.get",
          summary: "Get approval",
          description: "Load one durable approval record by id from the routed workspace store.",
        }),
      ),
      HttpApiEndpoint.get("affordances", RuntimePaths.affordances, {
        params: { approvalID: Schema.String },
        query: ApprovalAffordanceQuery,
        success: described(
          Schema.Array(AuthorityAffordanceSchema),
          "Runtime-derived authority affordances for an approval",
        ),
        error: [HttpApiError.BadRequest, ApiNotFoundError],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "runtime.approvals.affordances",
          summary: "Get authority affordances for an approval",
          description:
            "Runtime-derived, principal- and surface-sensitive read model for the authenticated Desktop/SDK caller. Clients render these affordances; they never infer actionability from approval state, route, or local fallback eligibility. Exact-request viewed fields are compared against the durable record and can only fail closed.",
        }),
      ),
      HttpApiEndpoint.post("approve", RuntimePaths.approve, {
        params: { approvalID: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: RuntimeApprovalCommandPayload,
        success: described(RuntimeApprovalCommandResponse, "Approval command result"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "runtime.approvals.approve",
          summary: "Approve an approval",
          description:
            "Approve a durable PENDING approval after exact-request revalidation. The operator identity is derived from the authenticated server context; client-supplied approver fields are never accepted. The approval itself never executes an effect — the PEP revalidates and executes after the decision.",
        }),
      ),
      HttpApiEndpoint.post("deny", RuntimePaths.deny, {
        params: { approvalID: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: RuntimeApprovalCommandPayload,
        success: described(RuntimeApprovalCommandResponse, "Approval command result"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "runtime.approvals.deny",
          summary: "Deny an approval",
          description:
            "Deny a durable PENDING approval. The parked tool call fails closed with zero effects.",
        }),
      ),
      HttpApiEndpoint.post("revoke", RuntimePaths.revoke, {
        params: { approvalID: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: RuntimeApprovalCommandPayload,
        success: described(RuntimeApprovalCommandResponse, "Approval command result"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "runtime.approvals.revoke",
          summary: "Revoke an approval",
          description:
            "Invalidate a PENDING or APPROVED-but-unclaimed approval. A revoked approval can never claim or execute; any parked gate fails closed.",
        }),
      ),
      HttpApiEndpoint.get("listSessions", RuntimePaths.sessions, {
        query: WorkspaceRoutingQuery,
        success: described(Schema.Array(Session.Info), "Sessions in this workspace"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "runtime.sessions.list",
          summary: "List sessions",
          description: "List sessions for the routed workspace.",
        }),
      ),
      HttpApiEndpoint.get("getSession", RuntimePaths.session, {
        params: { sessionID: SessionID },
        query: WorkspaceRoutingQuery,
        success: described(Session.Info, "Session"),
        error: [HttpApiError.BadRequest, ApiNotFoundError],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "runtime.sessions.get",
          summary: "Get session",
          description: "Load one session record by id.",
        }),
      ),
      HttpApiEndpoint.get("proof", RuntimePaths.proof, {
        params: { sessionID: SessionID },
        query: WorkspaceRoutingQuery,
        success: described(RunProofSnapshot, "RunProof snapshot"),
        error: [HttpApiError.BadRequest, ApiNotFoundError],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "runtime.proofs.get",
          summary: "Get RunProof snapshot",
          description:
            "Derive the current RunProof snapshot for a session (proof hash, trace health, integrity, authorization profile).",
        }),
      ),
      HttpApiEndpoint.post("desktopHeartbeat", RuntimePaths.desktopHeartbeat, {
        query: WorkspaceRoutingQuery,
        payload: DesktopHeartbeatPayload,
        success: described(DesktopHeartbeatResult, "Desktop subscriber heartbeat"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "runtime.desktop.heartbeat",
          summary: "Desktop subscriber heartbeat",
          description:
            "Advisory liveness announcement for a Desktop operator surface. The subscription expires automatically if not renewed. Heartbeat state never authorizes an action, extends approval expiry, fabricates operator identity, consumes an approval, changes a PDP result, or executes an effect.",
        }),
      ),
    )
    .annotateMerge(
      OpenApi.annotations({
        title: "runtime",
        description: "Workspace-scoped runtime contract for operators and Arcana Desktop.",
      }),
    )
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
