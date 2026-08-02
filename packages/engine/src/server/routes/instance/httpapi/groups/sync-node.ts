import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/api/sync"

export const SyncRequestContextSchema = Schema.Struct({
  protocolVersion: Schema.Literal(1),
  requestId: Schema.String,
  clientNonce: Schema.String,
  trustDomain: Schema.String,
  nodeId: Schema.String,
  nodeCertificateFingerprint: Schema.String,
  nodeKeyEpoch: Schema.Number,
  acceptedPolicySequence: Schema.Number,
  acceptedPolicyDigest: Schema.optional(Schema.String),
  acceptedRevocationSequence: Schema.Number,
  acceptedRevocationDigest: Schema.optional(Schema.String),
  acceptedEmergencyEpoch: Schema.Number,
  issuedAt: Schema.String,
  expiresAt: Schema.String,
})

export const SyncResponseContextSchema = Schema.Struct({
  protocolVersion: Schema.Literal(1),
  requestId: Schema.String,
  clientNonce: Schema.String,
  serverNonce: Schema.String,
  nodeId: Schema.String,
  serverIdentity: Schema.String,
  responseKind: Schema.Literals([
    "NO_CHANGE",
    "POLICY_SNAPSHOT",
    "POLICY_DELTA",
    "REVOCATION_SNAPSHOT",
    "REVOCATION_DELTA",
    "FULL_SNAPSHOT_REQUIRED",
    "QUARANTINE",
    "RETRY_LATER",
  ]),
  policySequence: Schema.optional(Schema.Number),
  policyDigest: Schema.optional(Schema.String),
  revocationSequence: Schema.optional(Schema.Number),
  revocationDigest: Schema.optional(Schema.String),
  emergencyEpoch: Schema.optional(Schema.Number),
  issuedAt: Schema.String,
  expiresAt: Schema.String,
})

export const SyncRequestEnvelopeSchema = Schema.Struct({
  context: SyncRequestContextSchema,
  signatureAlgorithm: Schema.Literal("Ed25519"),
  signature: Schema.String,
})

export const SyncResponseEnvelopeSchema = Schema.Struct({
  context: SyncResponseContextSchema,
  signatureAlgorithm: Schema.Literal("Ed25519"),
  signature: Schema.String,
})

export const SyncNodePaths = {
  policy: `${root}/policy`,
  revocation: `${root}/revocation`,
} as const

export class ApiSyncNodeUnauthorized extends Schema.ErrorClass<ApiSyncNodeUnauthorized>(
  "SyncNodeUnauthorized",
)(
  {
    name: Schema.Literal("SyncNodeUnauthorized"),
    message: Schema.String,
  },
  { httpApiStatus: 401 },
) {}

export const SyncNodeApi = HttpApi.make("syncNode").add(
  HttpApiGroup.make("syncNode")
    .add(
      HttpApiEndpoint.post("policy", SyncNodePaths.policy, {
        query: WorkspaceRoutingQuery,
        payload: SyncRequestEnvelopeSchema,
        success: described(
          Schema.Struct({ kind: Schema.Literal("RESPONSE"), envelope: SyncResponseEnvelopeSchema }),
          "Signed policy sync response",
        ),
        error: [ApiSyncNodeUnauthorized],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "syncNode.policy",
          summary: "Synchronize policy state",
          description:
            "Authenticated policy sync: the node presents a signed request envelope; the control plane verifies node enrollment, freshness, audience, and replay state, then returns a signed response envelope.",
        }),
      ),
      HttpApiEndpoint.post("revocation", SyncNodePaths.revocation, {
        query: WorkspaceRoutingQuery,
        payload: SyncRequestEnvelopeSchema,
        success: described(
          Schema.Struct({ kind: Schema.Literal("RESPONSE"), envelope: SyncResponseEnvelopeSchema }),
          "Signed revocation sync response",
        ),
        error: [ApiSyncNodeUnauthorized],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "syncNode.revocation",
          summary: "Synchronize revocation state",
          description:
            "Authenticated revocation sync with the same signed-envelope transport and replay protection as policy sync.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "syncNode", description: "Node/control-plane sync transport (D-6B-T)." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
