import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import {
  publishPolicyBundle,
  rollbackPolicy,
} from "@arcana/core/crypto/policy-bundle-store"
import type { SignedPolicyEnvelope } from "@arcana/core/crypto/signed-envelopes"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import { SignedPolicyEnvelopeSchema } from "../groups/policy"
import { controlStateFor, issuerContext } from "./control-state"

export const policyHandlers = HttpApiBuilder.group(InstanceHttpApi, "policy", (handlers) =>
  Effect.gen(function* () {
    const resolveDirectory = Effect.fn("PolicyHttpApi.resolveDirectory")(function* (
      queryDirectory?: string,
    ) {
      const routeDirectory = Option.getOrUndefined(
        (yield* Effect.serviceOption(WorkspaceRouteContext)).pipe(
          Option.map((ctx) => ctx.directory),
        ),
      )
      return routeDirectory || queryDirectory || process.cwd()
    })

    const publish = Effect.fn("PolicyHttpApi.publish")(function* (ctx: {
      payload: {
        envelope: typeof SignedPolicyEnvelopeSchema.Type
        activationTime: string
        compatibleFrom?: number
        compatibleTo?: number
      }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const issuer = issuerContext()
      if (!issuer.ok) {
        return { kind: "REJECTED" as const, reason: `issuer not configured: ${issuer.reason}` }
      }
      const result = publishPolicyBundle(
        {
          envelope: ctx.payload.envelope as unknown as SignedPolicyEnvelope,
          activationTime: ctx.payload.activationTime,
          compatibleFrom: ctx.payload.compatibleFrom,
          compatibleTo: ctx.payload.compatibleTo,
          trustedIssuerPublicKeys: issuer.context.issuerPublicKeys,
        },
        controlStateFor(directory).policyStore,
      )
      if (result.kind === "PUBLISHED") {
        return { kind: "PUBLISHED" as const, record: result.record }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    const current = Effect.fn("PolicyHttpApi.current")(function* (ctx: {
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      return controlStateFor(directory).policyStore.latestActive() ?? null
    })

    const rollback = Effect.fn("PolicyHttpApi.rollback")(function* (ctx: {
      payload: { toSequence: number }
      query: { directory?: string }
    }) {
      const directory = yield* resolveDirectory(ctx.query.directory)
      const result = rollbackPolicy(
        ctx.payload.toSequence,
        controlStateFor(directory).policyStore,
      )
      if (result.kind === "ROLLED_BACK") {
        return { kind: "ROLLED_BACK" as const, record: result.record }
      }
      return { kind: "REJECTED" as const, reason: result.reason }
    })

    return handlers
      .handle("publish", publish)
      .handle("current", current)
      .handle("rollback", rollback)
  }),
)
