import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/api/executions"

export const ExecutionKeySchema = Schema.Struct({
  executionId: Schema.String,
  nodeId: Schema.String,
  sessionId: Schema.String,
  requestHash: Schema.String,
  grantId: Schema.String,
  nonce: Schema.String,
})

export const ExecutionRecordSchema = Schema.Struct({
  key: ExecutionKeySchema,
  status: Schema.Literals([
    "PENDING",
    "EXECUTING",
    "COMPLETED",
    "FAILED",
    "UNKNOWN_AFTER_CRASH",
    "UNKNOWN_AFTER_NETWORK",
    "REJECTED",
  ]),
  effectOutcomeJson: Schema.optional(Schema.String),
  firstSeenAt: Schema.String,
  updatedAt: Schema.String,
})

export const ExecutionClaimResponse = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("CLAIMED"), record: ExecutionRecordSchema }),
  Schema.Struct({ kind: Schema.Literal("DUPLICATE"), record: ExecutionRecordSchema, detail: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("CONFLICT"), record: ExecutionRecordSchema, detail: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("REPLAY_FORBIDDEN"), record: ExecutionRecordSchema, detail: Schema.String }),
])

export const ExecutionPaths = {
  claim: `${root}/claim`,
  complete: `${root}/:executionId/complete`,
  unknown: `${root}/:executionId/unknown`,
} as const

export const ExecutionApi = HttpApi.make("executions").add(
  HttpApiGroup.make("executions")
    .add(
      HttpApiEndpoint.post("claim", ExecutionPaths.claim, {
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          key: ExecutionKeySchema,
          irreversible: Schema.optional(Schema.Boolean),
        }),
        success: described(ExecutionClaimResponse, "Execution claim result"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "executions.claim",
          summary: "Claim a distributed execution exactly once",
          description:
            "Exactly-once coordination: a fresh executionId+requestHash+grant+nonce is CLAIMED once; duplicates return the recorded outcome; identity changes CONFLICT; irreversible ambiguous outcomes forbid replay.",
        }),
      ),
      HttpApiEndpoint.post("complete", ExecutionPaths.complete, {
        params: { executionId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({ outcome: Schema.String }),
        success: described(Schema.Boolean, "Execution marked completed"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "executions.complete",
          summary: "Record a completed effect outcome",
        }),
      ),
      HttpApiEndpoint.post("unknown", ExecutionPaths.unknown, {
        params: { executionId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          reason: Schema.Literals(["CRASH", "NETWORK"]),
        }),
        success: described(Schema.Boolean, "Execution marked outcome-ambiguous"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "executions.unknown",
          summary: "Record an ambiguous outcome (crash/network)",
          description:
            "UNKNOWN_AFTER_CRASH/NETWORK blocks automatic replay of irreversible effects.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "executions", description: "Distributed exactly-once coordination (D-6)." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
