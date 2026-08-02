import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/api/policy"

export const SignedPolicyEnvelopeSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  issuerId: Schema.String,
  issuerEpoch: Schema.Number,
  sequence: Schema.Number,
  policyId: Schema.String,
  policyVersion: Schema.String,
  policyDigest: Schema.String,
  previousPolicyDigest: Schema.optional(Schema.String),
  issuedAt: Schema.String,
  expiresAt: Schema.String,
  signatureAlgorithm: Schema.Literal("Ed25519"),
  signature: Schema.String,
})

export const PolicyBundleRecordSchema = Schema.Struct({
  sequence: Schema.Number,
  policyId: Schema.String,
  policyVersion: Schema.String,
  digest: Schema.String,
  previousDigest: Schema.optional(Schema.String),
  signedEnvelopeJson: Schema.String,
  activationTime: Schema.String,
  compatibleFrom: Schema.Number,
  compatibleTo: Schema.Number,
  status: Schema.Literals(["STAGED", "ACTIVE", "SUPERSEDED", "ROLLED_BACK", "FAILED"]),
  lastKnownGood: Schema.Boolean,
  publishedAt: Schema.String,
  supersedes: Schema.optional(Schema.Number),
  rollbackOf: Schema.optional(Schema.Number),
})

export const PolicyPublishResponse = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("PUBLISHED"), record: PolicyBundleRecordSchema }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const PolicyRollbackResponse = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("ROLLED_BACK"), record: PolicyBundleRecordSchema }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const PolicyPaths = {
  publish: `${root}/bundles`,
  current: `${root}/current`,
  rollback: `${root}/rollback`,
} as const

export const PolicyApi = HttpApi.make("policy").add(
  HttpApiGroup.make("policy")
    .add(
      HttpApiEndpoint.post("publish", PolicyPaths.publish, {
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          envelope: SignedPolicyEnvelopeSchema,
          activationTime: Schema.String,
          compatibleFrom: Schema.optional(Schema.Number),
          compatibleTo: Schema.optional(Schema.Number),
        }),
        success: described(PolicyPublishResponse, "Policy bundle publish result"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "policy.publish",
          summary: "Publish a signed policy bundle",
          description:
            "Verifies the signed policy envelope (strict schema, issuer trust, chain continuity) and stages or activates it. Unknown mandatory fields are rejected.",
        }),
      ),
      HttpApiEndpoint.get("current", PolicyPaths.current, {
        query: WorkspaceRoutingQuery,
        success: described(
          Schema.Union([PolicyBundleRecordSchema, Schema.Null]),
          "Latest active policy bundle (or null)",
        ),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "policy.current",
          summary: "Get the latest active policy bundle",
        }),
      ),
      HttpApiEndpoint.post("rollback", PolicyPaths.rollback, {
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({ toSequence: Schema.Number }),
        success: described(PolicyRollbackResponse, "Policy rollback result"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "policy.rollback",
          summary: "Explicit audited policy rollback",
          description:
            "Rolls the active policy back to a previously active sequence; the superseded bundle is marked ROLLED_BACK with rollbackOf set.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "policy", description: "Central policy management (D-4)." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
