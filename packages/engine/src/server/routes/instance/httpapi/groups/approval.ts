import { SessionID } from "@/session/schema"
import { ApprovalRecordSchema } from "@/approval/events"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/api/session"

export const ApprovalCommandPayload = Schema.Struct({
  command: Schema.Literals(["APPROVE_ONCE", "DENY", "REVOKE"]),
  expectedVersion: Schema.Int,
  expectedRequestHash: Schema.String,
  expectedContractRevision: Schema.Int,
})

export const ApprovalCommandSuccess = Schema.Struct({
  success: Schema.Literal(true),
  approval: ApprovalRecordSchema,
})
export const ApprovalCommandFailure = Schema.Struct({
  success: Schema.Literal(false),
  reason: Schema.String,
  stale: Schema.optional(Schema.Boolean),
})
export const ApprovalCommandResponse = Schema.Union([ApprovalCommandSuccess, ApprovalCommandFailure])

export const ApprovalMapResponse = Schema.Record(Schema.String, ApprovalRecordSchema)

export const ApprovalPaths = {
  command: `${root}/:sessionID/approval/:approvalID/command`,
  list: `${root}/:sessionID/approval`,
} as const

export const ApprovalApi = HttpApi.make("approval")
  .add(
    HttpApiGroup.make("approval")
      .add(
        HttpApiEndpoint.post("command", ApprovalPaths.command, {
          params: { sessionID: SessionID, approvalID: Schema.String },
          query: WorkspaceRoutingQuery,
          payload: ApprovalCommandPayload,
          success: described(ApprovalCommandResponse, "Approval command result"),
          error: [HttpApiError.BadRequest],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "approval.command",
            summary: "Submit an operator approval command",
            description:
              "Submit an APPROVE_ONCE or DENY command for a durable approval. The body carries the version, request hash and contract revision the operator saw; mismatches return success:false with stale:true and nothing is executed. On success the parked tool call resumes (APPROVE_ONCE) or fails closed (DENY).",
          }),
        ),
        HttpApiEndpoint.get("list", ApprovalPaths.list, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(ApprovalMapResponse, "Approvals for a session"),
          error: [HttpApiError.BadRequest],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "approval.list",
            summary: "List approvals for a session",
            description:
              "Snapshot of all durable approval records for a session, keyed by approvalId. Used by the TUI to hydrate the approvals sync store.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "approval",
          description: "Durable approval operator transport (RB-01).",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "arcana experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
