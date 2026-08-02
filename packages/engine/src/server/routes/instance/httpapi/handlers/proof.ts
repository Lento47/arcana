import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { decodeCanonicalBase64url } from "@arcana/core/crypto/canonical-serializer"
import {
  registerProofBatch,
  reconcileNodeProofs,
  type ProofRegistrationContext,
} from "@arcana/core/crypto/proof-registration"
import { SqliteProofBatchLedger } from "@arcana/core/crypto/proof-registration-sqlite"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import { ProofBatchEnvelopeSchema, ReconcileQuery } from "../groups/proof"

/**
 * Node registry: D-1 enrollment is a separate work package (BLK-D-05).
 * Until it lands, the co-located control plane reads node public keys from
 * ARCANA_CONTROL_NODE_KEYS (JSON: nodeId -> base64url Ed25519 public key).
 * Missing registry data fails closed: every registration is rejected with
 * NODE_NOT_ENROLLED.
 */
function nodeRegistryFromEnv(): ReadonlyMap<string, Uint8Array> {
  const raw = process.env.ARCANA_CONTROL_NODE_KEYS
  if (!raw) return new Map()
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    const map = new Map<string, Uint8Array>()
    for (const [id, encoded] of Object.entries(parsed)) {
      const key = decodeCanonicalBase64url(encoded)
      if (key && key.length === 32) map.set(id, key)
    }
    return map
  } catch {
    return new Map()
  }
}

function trustDomainFromEnv(): string {
  return process.env.ARCANA_CONTROL_TRUST_DOMAIN ?? "arcana.local"
}

const ledgers = new Map<string, SqliteProofBatchLedger>()

function ledgerFor(directory: string): SqliteProofBatchLedger {
  const key = directory
  let ledger = ledgers.get(key)
  if (!ledger) {
    const stateDir = join(directory, ".arcana")
    mkdirSync(stateDir, { recursive: true })
    ledger = new SqliteProofBatchLedger(new Database(join(stateDir, "control-plane.db")))
    ledgers.set(key, ledger)
  }
  return ledger
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
        const context: ProofRegistrationContext = {
          acceptedTrustDomain: trustDomainFromEnv(),
          nodePublicKeys: nodeRegistryFromEnv(),
        }
        const result = registerProofBatch(ctx.payload, ledgerFor(directory), context)
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
        ledgerFor(directory),
      )
    })

    return handlers
      .handle("registerBatch", register)
      .handle("reconcile", reconcile)
  }),
)
