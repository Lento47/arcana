import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { publishRevocation } from "@arcana/core/crypto/revocation-store"
import { REVOCATION_DOMAIN, type RevocationStatement } from "@arcana/core/crypto/signed-envelopes"
import { signEnvelope, setNodeStatus } from "@arcana/core/crypto/node-enrollment"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import { RevocationStatementSchema } from "../groups/revocations"
import { controlStateFor, issuerContext } from "./control-state"

export const revocationHandlers = HttpApiBuilder.group(InstanceHttpApi, "revocations", (handlers) =>
  Effect.gen(function* () {
    const resolveDirectory = Effect.fn("RevocationHttpApi.resolveDirectory")(function* (
      queryDirectory?: string,
    ) {
      const routeDirectory = Option.getOrUndefined(
        (yield* Effect.serviceOption(WorkspaceRouteContext)).pipe(
          Option.map((ctx) => ctx.directory),
        ),
      )
      return routeDirectory || queryDirectory || process.cwd()
    })

    const publish = Effect.fn("RevocationHttpApi.publish")(function* (ctx: {
      payload: { statement: typeof RevocationStatementSchema.Type }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const issuer = issuerContext()
      if (!issuer.ok) {
        return { kind: "REJECTED" as const, reason: `issuer not configured: ${issuer.reason}` }
      }
      const result = publishRevocation(
        {
          statement: ctx.payload.statement as unknown as RevocationStatement,
          trustedIssuerPublicKeys: issuer.context.issuerPublicKeys,
        },
        controlStateFor(directory).revocationStore,
      )
      if (result.kind === "PUBLISHED") {
        return { kind: "PUBLISHED" as const, record: result.record }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    const current = Effect.fn("RevocationHttpApi.current")(function* (ctx: {
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).revocationStore.last() ?? null
    })

    const emergency = Effect.fn("RevocationHttpApi.emergency")(function* (ctx: {
      payload: { nodeId: string; reason: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const state = controlStateFor(directory)
      const issuer = issuerContext()
      if (!issuer.ok) {
        return { kind: "REJECTED" as const, reason: `issuer not configured: ${issuer.reason}` }
      }
      if (!state.registry.get(ctx.payload.nodeId)) {
        return { kind: "REJECTED" as const, reason: `node ${ctx.payload.nodeId} is not enrolled` }
      }

      const status = setNodeStatus(ctx.payload.nodeId, "REVOKED", state.registry)
      if (!status.ok) {
        return { kind: "REJECTED" as const, reason: status.reason }
      }

      const last = state.revocationStore.last()
      const sequence = (last?.sequence ?? 0) + 1
      const now = new Date()
      const statement = signEnvelope(
        REVOCATION_DOMAIN,
        {
          schemaVersion: 1,
          issuerId: issuer.context.issuerId,
          issuerEpoch: 1,
          sequence,
          subjectType: "NODE",
          subjectId: ctx.payload.nodeId,
          reason: ctx.payload.reason,
          effectiveAt: now.toISOString(),
          issuedAt: now.toISOString(),
        },
        issuer.context.issuerSecretKey,
      ) as unknown as RevocationStatement

      const result = publishRevocation(
        {
          statement,
          trustedIssuerPublicKeys: issuer.context.issuerPublicKeys,
        },
        state.revocationStore,
      )
      if (result.kind === "PUBLISHED") {
        return { kind: "PUBLISHED" as const, record: result.record }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    return handlers.handle("publish", publish).handle("current", current).handle("emergency", emergency)
  }),
)
