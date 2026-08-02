import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import {
  registerProofBatch,
  reconcileNodeProofs,
  type ProofRegistrationContext,
} from "@arcana/core/crypto/proof-registration"
import { registryKeysForTrustDomain } from "@arcana/core/crypto/node-enrollment"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import { ProofBatchEnvelopeSchema, ReconcileQuery } from "../groups/proof"
import { controlStateFor } from "./control-state"

/**
 * The node registry is the durable D-1 enrollment registry. Missing registry
 * data fails closed: every registration is rejected with NODE_NOT_ENROLLED.
 */
function trustDomainFromEnv(): string {
  return process.env.ARCANA_CONTROL_TRUST_DOMAIN ?? "arcana.local"
}

export const proofHandlers = HttpApiBuilder.group(InstanceHttpApi, "proof", (handlers) =>
  Effect.gen(function* () {
    const resolveDirectory = Effect.fn("ProofHttpApi.resolveDirectory")(function* (
      queryDirectory?: string,
    ) {
      const routeDirectory = Option.getOrUndefined(
        (yield* Effect.serviceOption(WorkspaceRouteContext)).pipe(
          Option.map((ctx) => ctx.directory),
        ),
      )
      return routeDirectory || queryDirectory || process.cwd()
    })

    const register = Effect.fn("ProofHttpApi.registerBatch")(function* (ctx: {
      payload: typeof ProofBatchEnvelopeSchema.Type
      query: { directory?: string }
    }) {
      try {
        const directory = yield* resolveDirectory(ctx.query.directory)
        const state = controlStateFor(directory)
        const trustDomain = trustDomainFromEnv()
        const context: ProofRegistrationContext = {
          acceptedTrustDomain: trustDomain,
          nodePublicKeys: registryKeysForTrustDomain(state.registry, trustDomain),
        }
        const result = registerProofBatch(ctx.payload, state.ledger, context)
        if (result.kind === "REJECTED") {
          return {
            kind: "REJECTED" as const,
            reason: result.reason,
            detail: result.detail,
          }
        }
        return {
          kind: result.kind,
          receiptId: result.receipt.receiptId,
          nodeId: result.receipt.nodeId,
          batchRoot: result.receipt.batchRoot,
          status: result.receipt.status,
          acknowledgedFirstSequence: result.receipt.acknowledgedFirstSequence,
          acknowledgedLastSequence: result.receipt.acknowledgedLastSequence,
          acknowledgedAt: result.receipt.acknowledgedAt,
        }
      } catch (error) {
        console.error("PROOF HANDLER ERROR", error)
        return {
          kind: "REJECTED" as const,
          reason: "PAYLOAD_INVALID" as const,
          detail: String(error),
        }
      }
    })

    const reconcile = Effect.fn("ProofHttpApi.reconcile")(function* (ctx: {
      params: { nodeId: string }
      query: typeof ReconcileQuery.Type
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return reconcileNodeProofs(
        {
          nodeId: ctx.params.nodeId,
          firstLocalSequence: ctx.query.firstLocalSequence,
          lastLocalSequence: ctx.query.lastLocalSequence,
          lastBatchRoot: ctx.query.lastBatchRoot,
        },
        controlStateFor(directory).ledger,
      )
    })

    return handlers
      .handle("registerBatch", register)
      .handle("reconcile", reconcile)
  }),
)
