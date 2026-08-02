import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/api/proof"

// ─── Wire Schemas (D-8B) ────────────────────────────────────────────

export const NodeProofBatchPayloadSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  trustDomain: Schema.String,
  nodeId: Schema.String,
  nodeKeyEpoch: Schema.Number,
  firstLocalSequence: Schema.Number,
  lastLocalSequence: Schema.Number,
  previousBatchRoot: Schema.optional(Schema.String),
  eventMerkleRoot: Schema.String,
  runProofHashes: Schema.Array(Schema.String),
  policySequence: Schema.Number,
  policyDigest: Schema.String,
  revocationSequence: Schema.Number,
  revocationDigest: Schema.String,
  emergencyEpoch: Schema.Number,
  issuedAt: Schema.String,
})

export const ProofBatchEnvelopeSchema = Schema.Struct({
  payload: NodeProofBatchPayloadSchema,
  batchRoot: Schema.String,
  signatureAlgorithm: Schema.Literal("Ed25519"),
  signature: Schema.String,
})

const RegistrationOk = Schema.Struct({
  kind: Schema.Literals(["REGISTERED", "DUPLICATE"]),
  receiptId: Schema.String,
  nodeId: Schema.String,
  batchRoot: Schema.String,
  status: Schema.Literals(["REGISTERED", "DUPLICATE"]),
  acknowledgedFirstSequence: Schema.Number,
  acknowledgedLastSequence: Schema.Number,
})

const RegistrationRejected = Schema.Struct({
  kind: Schema.Literal("REJECTED"),
  reason: Schema.String,
  detail: Schema.String,
})

export const ProofRegistrationResponse = Schema.Union([RegistrationOk, RegistrationRejected])

export const ReconciliationResponse = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("RECONCILED"),
    nodeId: Schema.String,
    batchCount: Schema.Number,
    firstLocalSequence: Schema.Number,
    lastLocalSequence: Schema.Number,
    lastBatchRoot: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    status: Schema.Literal("GAPS_DETECTED"),
    nodeId: Schema.String,
    batchCount: Schema.Number,
    gaps: Schema.Array(
      Schema.Struct({
        from: Schema.Number,
        to: Schema.Number,
      }),
    ),
    nextExpected: Schema.Number,
  }),
  Schema.Struct({
    status: Schema.Literal("MISMATCH"),
    nodeId: Schema.String,
    batchCount: Schema.Number,
    reason: Schema.String,
  }),
])

export const ReconcileQuery = Schema.Struct({
  ...WorkspaceRoutingQuery.fields,
  firstLocalSequence: Schema.Number,
  lastLocalSequence: Schema.Number,
  lastBatchRoot: Schema.optional(Schema.String),
})

export const ProofPaths = {
  register: `${root}/batches`,
  reconcile: `${root}/nodes/:nodeId/reconcile`,
} as const

export const ProofApi = HttpApi.make("proof").add(
  HttpApiGroup.make("proof")
    .add(
      HttpApiEndpoint.post("registerBatch", ProofPaths.register, {
        query: WorkspaceRoutingQuery,
        payload: ProofBatchEnvelopeSchema,
        success: described(ProofRegistrationResponse, "Proof batch registration result"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "proof.registerBatch",
          summary: "Register a node proof batch",
          description:
            "Control-plane registration of a signed node proof batch. Validates payload/root consistency, Ed25519 signature, node enrollment, trust domain, duplicate idempotency, and chain continuity (previous batch root + sequence adjacency).",
        }),
      ),
      HttpApiEndpoint.get("reconcile", ProofPaths.reconcile, {
        params: { nodeId: Schema.String },
        query: ReconcileQuery,
        success: described(ReconciliationResponse, "Node/server proof reconciliation"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "proof.reconcile",
          summary: "Reconcile a node's proof state",
          description:
            "Compares the node's reported local proof range/terminal root against the control-plane ledger; reports RECONCILED, GAPS_DETECTED, or MISMATCH.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "proof", description: "Control-plane proof registration (D-8B)." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
