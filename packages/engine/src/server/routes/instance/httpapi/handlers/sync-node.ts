import { createHash, randomUUID } from "node:crypto"
import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { decodeCanonicalBase64url } from "@arcana/core/crypto/canonical-serializer"
import { verifySyncRequest } from "@arcana/core/crypto/sync-transport"
import { signSyncResponse } from "@arcana/core/crypto/sync-transport"
import type { SyncResponseContext } from "@arcana/core/crypto/sync-auth"
import { buildPolicyDelta } from "@arcana/core/crypto/policy-delta"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import {
  ApiSyncNodeUnauthorized,
  SyncRequestEnvelopeSchema,
} from "../groups/sync-node"
import { controlStateFor, issuerContext } from "./control-state"

function trustDomainFromEnv(): string {
  return process.env.ARCANA_CONTROL_TRUST_DOMAIN ?? "arcana.local"
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export const syncNodeHandlers = HttpApiBuilder.group(InstanceHttpApi, "syncNode", (handlers) =>
  Effect.gen(function* () {
    const resolveDirectory = Effect.fn("SyncNodeHttpApi.resolveDirectory")(function* (
      queryDirectory?: string,
    ) {
      const routeDirectory = Option.getOrUndefined(
        (yield* Effect.serviceOption(WorkspaceRouteContext)).pipe(
          Option.map((ctx) => ctx.directory),
        ),
      )
      return routeDirectory || queryDirectory || process.cwd()
    })

    const unauthorized = (message: string) =>
      new ApiSyncNodeUnauthorized({ name: "SyncNodeUnauthorized", message })

    const sync = Effect.fn("SyncNodeHttpApi.sync")(function* (
      kind: "policy" | "revocation",
      ctx: {
        payload: typeof SyncRequestEnvelopeSchema.Type
        query: { directory?: string }
      },
    ) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      const trustDomain = trustDomainFromEnv()
      const requestContext = ctx.payload.context
      const now = new Date()

      if (requestContext.trustDomain !== trustDomain) {
        return yield* Effect.fail(
          unauthorized(`trustDomain mismatch: ${requestContext.trustDomain} != ${trustDomain}`),
        )
      }

      const record = state.registry.get(requestContext.nodeId)
      if (!record || record.status !== "TRUSTED") {
        return yield* Effect.fail(unauthorized("node is not enrolled or not trusted"))
      }
      if (record.nodeKeyEpoch !== requestContext.nodeKeyEpoch) {
        return yield* Effect.fail(unauthorized("rotated node key; current epoch required"))
      }
      const publicKey = decodeCanonicalBase64url(record.publicKey)
      if (!publicKey) {
        return yield* Effect.fail(unauthorized("invalid enrolled node key"))
      }

      const verified = verifySyncRequest(ctx.payload, publicKey, {
        nodeId: requestContext.nodeId,
        trustDomain,
        now,
      })
      if (!verified.valid) {
        return yield* Effect.fail(unauthorized(`request verification failed: ${verified.reason}`))
      }

      // Replay protection: same requestId + same nonce is an idempotent retry
      // (replay the identical stored response); same requestId + different
      // nonce is a security conflict.
      const prior = state.replayStore.findRequest(requestContext.requestId)
      if (prior) {
        if (prior.clientNonce !== requestContext.clientNonce) {
          return yield* Effect.fail(unauthorized("replay conflict: requestId reused with a different nonce"))
        }
        const stored = state.replayStore.find(requestContext.requestId)
        if (stored) {
          return {
            kind: "RESPONSE" as const,
            envelope: JSON.parse(stored.responseJson),
          }
        }
      }

      const issuer = issuerContext()
      if (!issuer.ok) {
        return yield* Effect.fail(unauthorized(`issuer not configured: ${issuer.reason}`))
      }

      const serverNonce = randomUUID()
      const issuedAt = now.toISOString()
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString()

      const latestPolicy = state.policyStore.latestActive()
      const latestRevocation = state.revocationStore.last()
      const policyDelta =
        latestPolicy !== undefined &&
        latestPolicy.previousDigest !== undefined &&
        requestContext.acceptedPolicySequence === latestPolicy.sequence - 1 &&
        (requestContext.acceptedPolicyDigest ?? undefined) === latestPolicy.previousDigest
          ? (() => {
              const base = state.policyStore.getBySequence(latestPolicy.sequence - 1)
              return base ? buildPolicyDelta(base, latestPolicy, now) : undefined
            })()
          : undefined
      const policyNeedsSnapshot =
        latestPolicy !== undefined &&
        policyDelta === undefined &&
        (requestContext.acceptedPolicySequence < latestPolicy.sequence ||
          (requestContext.acceptedPolicyDigest ?? "") !== latestPolicy.digest)

      const acceptedRevocationSequence = requestContext.acceptedRevocationSequence
      const revocationStatements =
        latestRevocation !== undefined && acceptedRevocationSequence < latestRevocation.sequence
          ? state.revocationStore
              .history()
              .filter((record) => record.sequence > acceptedRevocationSequence)
          : []
      const revocationDeltaOk =
        revocationStatements.length > 0 &&
        revocationStatements.length <= 32 &&
        (acceptedRevocationSequence === 0 ||
          (() => {
            const previous = state.revocationStore.getBySequence(acceptedRevocationSequence)
            return (
              previous !== undefined &&
              (requestContext.acceptedRevocationDigest ?? undefined) === previous.digest
            )
          })())
      const revocationNeedsSnapshot =
        latestRevocation !== undefined &&
        !revocationDeltaOk &&
        (requestContext.acceptedRevocationSequence < latestRevocation.sequence ||
          (requestContext.acceptedRevocationDigest ?? "") !== latestRevocation.digest)

      const base = {
        protocolVersion: 1 as const,
        requestId: requestContext.requestId,
        clientNonce: requestContext.clientNonce,
        serverNonce,
        nodeId: requestContext.nodeId,
        serverIdentity: issuer.context.issuerId,
        issuedAt,
        expiresAt,
      }

      const responseContext: SyncResponseContext =
        kind === "policy"
          ? policyDelta
            ? {
                ...base,
                responseKind: "POLICY_DELTA",
                policySequence: latestPolicy!.sequence,
                policyDigest: latestPolicy!.digest,
                delta: policyDelta as unknown as Record<string, unknown>,
                envelope: JSON.parse(latestPolicy!.signedEnvelopeJson),
              }
            : policyNeedsSnapshot
            ? {
                ...base,
                responseKind: "POLICY_SNAPSHOT",
                policySequence: latestPolicy!.sequence,
                policyDigest: latestPolicy!.digest,
                envelope: JSON.parse(latestPolicy!.signedEnvelopeJson),
              }
            : {
                ...base,
                responseKind: "NO_CHANGE",
                policySequence: requestContext.acceptedPolicySequence,
                policyDigest: requestContext.acceptedPolicyDigest ?? "",
              }
          : {
              ...base,
              ...(revocationDeltaOk
                ? {
                    responseKind: "REVOCATION_DELTA" as const,
                    revocationSequence: latestRevocation!.sequence,
                    revocationDigest: latestRevocation!.digest,
                    envelopes: revocationStatements.map((statement) =>
                      JSON.parse(statement.signedStatementJson),
                    ),
                  }
                : revocationNeedsSnapshot
                ? {
                    responseKind: "REVOCATION_SNAPSHOT" as const,
                    revocationSequence: latestRevocation!.sequence,
                    revocationDigest: latestRevocation!.digest,
                    envelope: JSON.parse(latestRevocation!.signedStatementJson),
                  }
                : {
                    responseKind: "NO_CHANGE" as const,
                    revocationSequence: requestContext.acceptedRevocationSequence,
                    revocationDigest: requestContext.acceptedRevocationDigest ?? "",
                    emergencyEpoch: requestContext.acceptedEmergencyEpoch,
                  }),
            }

      const envelope = signSyncResponse(responseContext, issuer.context.issuerSecretKey)
      const responseJson = JSON.stringify(envelope)
      const digest = sha256Hex(responseJson)
      state.replayStore.record(responseContext, digest, responseJson, now)
      state.replayStore.recordRequest(requestContext.requestId, requestContext.clientNonce, now)

      return { kind: "RESPONSE" as const, envelope }
    })

    return handlers
      .handle("policy", (ctx: { payload: typeof SyncRequestEnvelopeSchema.Type; query: { directory?: string } }) =>
        sync("policy", ctx),
      )
      .handle("revocation", (ctx: { payload: typeof SyncRequestEnvelopeSchema.Type; query: { directory?: string } }) =>
        sync("revocation", ctx),
      )
  }),
)
