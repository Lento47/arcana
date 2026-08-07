import { SessionID } from "@/session/schema"
import { ApprovalRecordSchema } from "@/approval/events"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"
import { ApprovalAffordanceQuery, AuthorityAffordanceSchema } from "./affordance"
import { ApprovalNotFoundError, ApiNotFoundError } from "../errors"

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

export const DiffPreviewSchema = Schema.Struct({
  filePath: Schema.String,
  kind: Schema.Literals(["add", "delete", "modify", "rename", "unknown"]),
  additions: Schema.optional(Schema.Number),
  deletions: Schema.optional(Schema.Number),
  content: Schema.optional(Schema.String),
})

export const ArtifactPreviewSchema = Schema.Struct({
  kind: Schema.String,
  name: Schema.String,
  contentType: Schema.optional(Schema.String),
  size: Schema.optional(Schema.Number),
  url: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
})

/**
 * Immutable reviewable request projection (audit PR-2). Mirrors
 * ApprovalRequestSnapshot in @arcana/core/crypto/approval-request-snapshot.
 * The runtime recomputes the canonical request hash and verifies it against
 * the approval record before this is ever returned.
 */
export const ApprovalRequestSnapshotSchema = Schema.Struct({
  schemaVersion: Schema.Literal("1"),
  approvalId: Schema.String,
  requestHash: Schema.String,
  action: Schema.String,
  resource: Schema.String,
  arguments: Schema.String,
  capability: Schema.String,
  principalId: Schema.String,
  intentId: Schema.optional(Schema.String),
  policyVersion: Schema.String,
  contractRevision: Schema.Number,
  riskClass: Schema.Literals(["LOW", "MODERATE", "HIGH", "CRITICAL"]),
  diffPreview: Schema.optional(DiffPreviewSchema),
  artifactPreview: Schema.optional(ArtifactPreviewSchema),
}).annotate({ identifier: "ApprovalRequestSnapshot" })

export const ApprovalDetailSuccess = Schema.Struct({
  approval: ApprovalRecordSchema,
  snapshot: ApprovalRequestSnapshotSchema,
  snapshotVerified: Schema.Literal(true),
})

/**
 * Fail-closed: the approval exists but its immutable request snapshot is
 * missing or failed hash verification. The operator must NOT review a
 * hash-associated record without the verified exact request.
 */
export class ApprovalSnapshotUnavailableError extends Schema.TaggedErrorClass<ApprovalSnapshotUnavailableError>()(
  "ApprovalSnapshotUnavailableError",
  {
    message: Schema.String,
    reason: Schema.Literals(["snapshot_missing", "snapshot_tampered"]),
    approvalId: Schema.String,
  },
  { httpApiStatus: 422 },
) {}

export const ApprovalPaths = {
  command: `${root}/:sessionID/approval/:approvalID/command`,
  list: `${root}/:sessionID/approval`,
  detail: `${root}/:sessionID/approval/:approvalID/detail`,
  affordances: `${root}/:sessionID/approval/:approvalID/affordances`,
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
        HttpApiEndpoint.get("detail", ApprovalPaths.detail, {
          params: { sessionID: SessionID, approvalID: Schema.String },
          query: WorkspaceRoutingQuery,
          success: described(ApprovalDetailSuccess, "Approval record + verified immutable request snapshot"),
          error: [HttpApiError.BadRequest, ApprovalNotFoundError, ApprovalSnapshotUnavailableError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "approval.detail",
            summary: "Get an approval with its verified request snapshot",
            description:
              "Return the durable approval record plus its immutable, hash-verified request snapshot (action, resource, arguments, capability, policy version, previews). The runtime recomputes the canonical request hash and verifies it equals the record's requestHash before responding; a missing or changed snapshot returns a fail-closed ApprovalSnapshotUnavailableError — never a silently stale snapshot.",
          }),
        ),
        HttpApiEndpoint.get("affordances", ApprovalPaths.affordances, {
          params: { sessionID: SessionID, approvalID: Schema.String },
          query: ApprovalAffordanceQuery,
          success: described(
            Schema.Array(AuthorityAffordanceSchema),
            "Runtime-derived authority affordances for an approval",
          ),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "approval.affordances",
            summary: "Get authority affordances for an approval",
            description:
              "Runtime-derived, principal- and surface-sensitive read model for the authenticated LOCAL_TUI operator. Clients render these affordances; they never infer actionability from approval state, route, or local fallback eligibility. Exact-request viewed fields are compared against the durable record and can only fail closed.",
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
