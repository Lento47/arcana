import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/api/nodes"

export const JoinTokenSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  tokenId: Schema.String,
  organizationId: Schema.String,
  trustDomain: Schema.String,
  nodeId: Schema.String,
  issuedAt: Schema.String,
  expiresAt: Schema.String,
  signatureAlgorithm: Schema.Literal("Ed25519"),
  signature: Schema.String,
})

export const NodeIdentityCertificateSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  nodeId: Schema.String,
  organizationId: Schema.String,
  publicKey: Schema.String,
  issuerId: Schema.String,
  issuerEpoch: Schema.Number,
  issuedAt: Schema.String,
  expiresAt: Schema.String,
  capabilities: Schema.Array(Schema.String),
  signatureAlgorithm: Schema.Literal("Ed25519"),
  signature: Schema.String,
})

export const EnrolledNodeSchema = Schema.Struct({
  nodeId: Schema.String,
  organizationId: Schema.String,
  trustDomain: Schema.String,
  status: Schema.Literals(["UNREGISTERED", "PENDING", "TRUSTED", "SUSPENDED", "REVOKED"]),
  publicKey: Schema.String,
  nodeKeyEpoch: Schema.Number,
  certificate: NodeIdentityCertificateSchema,
  enrolledAt: Schema.String,
  lastKeyRotatedAt: Schema.optional(Schema.String),
  decommissionedAt: Schema.optional(Schema.String),
})

export const EnrollmentFailure = Schema.Struct({
  kind: Schema.Literals(["REJECTED", "DUPLICATE_ENROLLMENT"]),
  detail: Schema.String,
})

export const EnrollResponse = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("ENROLLED"), record: EnrolledNodeSchema }),
  EnrollmentFailure,
])

export const RotationResponse = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("ROTATED"), record: EnrolledNodeSchema }),
  EnrollmentFailure,
])

export const StatusResponse = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), record: EnrolledNodeSchema }),
  Schema.Struct({ ok: Schema.Literal(false), reason: Schema.String }),
])

export const EnrollmentPaths = {
  enroll: `${root}/enroll`,
  rotate: `${root}/:nodeId/rotate`,
  status: `${root}/:nodeId/status`,
  get: `${root}/:nodeId`,
} as const

export const EnrollmentApi = HttpApi.make("enrollment").add(
  HttpApiGroup.make("enrollment")
    .add(
      HttpApiEndpoint.post("enroll", EnrollmentPaths.enroll, {
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          joinToken: JoinTokenSchema,
          publicKey: Schema.String,
        }),
        success: described(EnrollResponse, "Node enrollment result"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enrollment.enroll",
          summary: "Enroll a node with a join token",
          description:
            "Verifies the join token (signature, expiry, org/trust-domain/node audience) and issues a NodeIdentityCertificate bound to the presented Ed25519 public key.",
        }),
      ),
      HttpApiEndpoint.post("rotate", EnrollmentPaths.rotate, {
        params: { nodeId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({ publicKey: Schema.String }),
        success: described(RotationResponse, "Node key rotation result"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enrollment.rotate",
          summary: "Rotate a node key",
          description:
            "Advances nodeKeyEpoch, issues a new certificate, and supersedes the previous key; rotated keys are rejected thereafter.",
        }),
      ),
      HttpApiEndpoint.post("status", EnrollmentPaths.status, {
        params: { nodeId: Schema.String },
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          status: Schema.Literals(["TRUSTED", "SUSPENDED", "REVOKED"]),
        }),
        success: described(StatusResponse, "Node status transition result"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enrollment.status",
          summary: "Suspend, reinstate, or decommission a node",
          description: "REVOKED decommissions the node and blocks re-enrollment.",
        }),
      ),
      HttpApiEndpoint.get("get", EnrollmentPaths.get, {
        params: { nodeId: Schema.String },
        query: WorkspaceRoutingQuery,
        success: described(Schema.Union([EnrolledNodeSchema, Schema.String]), "Enrolled node record"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "enrollment.get",
          summary: "Get an enrolled node record",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "enrollment", description: "Node enrollment and key rotation (D-1)." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
