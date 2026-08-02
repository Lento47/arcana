import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { publishRevocation } from "@arcana/core/crypto/revocation-store"
import type { RevocationStatement } from "@arcana/core/crypto/signed-envelopes"
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

    return handlers.handle("publish", publish).handle("current", current)
  }),
)
