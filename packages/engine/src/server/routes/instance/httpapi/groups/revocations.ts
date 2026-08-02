import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/api/revocations"

export const RevocationStatementSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  issuerId: Schema.String,
  issuerEpoch: Schema.Number,
  sequence: Schema.Number,
  subjectType: Schema.Literals(["GRANT", "NODE", "ISSUER_KEY", "POLICY"]),
  subjectId: Schema.String,
  reason: Schema.String,
  effectiveAt: Schema.String,
  issuedAt: Schema.String,
  signatureAlgorithm: Schema.Literal("Ed25519"),
  signature: Schema.String,
})

export const RevocationRecordSchema = Schema.Struct({
  sequence: Schema.Number,
  issuerId: Schema.String,
  issuerEpoch: Schema.Number,
  subjectType: Schema.String,
  subjectId: Schema.String,
  reason: Schema.String,
  effectiveAt: Schema.String,
  issuedAt: Schema.String,
  signedStatementJson: Schema.String,
  digest: Schema.String,
  publishedAt: Schema.String,
})

export const RevocationPublishResponse = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("PUBLISHED"), record: RevocationRecordSchema }),
  Schema.Struct({ kind: Schema.Literal("REJECTED"), reason: Schema.String }),
])

export const RevocationPaths = {
  publish: `${root}`,
  current: `${root}/current`,
  emergency: `${root}/emergency`,
} as const

export const RevocationApi = HttpApi.make("revocations").add(
  HttpApiGroup.make("revocations")
    .add(
      HttpApiEndpoint.post("publish", RevocationPaths.publish, {
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({ statement: RevocationStatementSchema }),
        success: described(RevocationPublishResponse, "Revocation publish result"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "revocations.publish",
          summary: "Publish a signed revocation statement",
          description:
            "Verifies issuer signature and sequence monotonicity (rollback rejected) before storing; sync endpoints deliver REVOCATION_SNAPSHOT to behind nodes.",
        }),
      ),
      HttpApiEndpoint.get("current", RevocationPaths.current, {
        query: WorkspaceRoutingQuery,
        success: described(
          Schema.Union([RevocationRecordSchema, Schema.Null]),
          "Latest revocation statement (or null)",
        ),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "revocations.current",
          summary: "Get the latest revocation statement",
        }),
      ),
      HttpApiEndpoint.post("emergency", RevocationPaths.emergency, {
        query: WorkspaceRoutingQuery,
        payload: Schema.Struct({
          nodeId: Schema.String,
          reason: Schema.String,
        }),
        success: described(RevocationPublishResponse, "Emergency node denial result"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "revocations.emergency",
          summary: "Emergency-deny a node",
          description:
            "Immediately revokes the node (enrollment status REVOKED) and publishes a signed NODE revocation statement so the deny-list propagates through the normal sync channel.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "revocations", description: "Revocation statement management (D-5)." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
