import { LayerNode } from "@arcana/core/effect/layer-node"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { Effect, Layer, Scope, Context, Schema } from "effect"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ShareNext } from "./share-next"

/**
 * A policy refusal, not an outage: sharing is off by configuration or the
 * license does not cover it. The HTTP layer maps this to a 403 whose message
 * reaches the operator verbatim — an empty 500 was how "share is broken"
 * started.
 */
export class SharePolicyError extends Schema.TaggedErrorClass<SharePolicyError>()("SharePolicyError", {
  message: Schema.String,
}) {}

export interface Interface {
  readonly create: (input?: Session.CreateInput) => Effect.Effect<Session.Info>
  readonly share: (sessionID: SessionID) => Effect.Effect<{ url: string }, unknown>
  readonly unshare: (sessionID: SessionID) => Effect.Effect<void, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/SessionShare") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const cfg = yield* Config.Service
    const session = yield* Session.Service
    const shareNext = yield* ShareNext.Service
    const scope = yield* Scope.Scope
    const flags = yield* RuntimeFlags.Service

    const share = Effect.fn("SessionShare.share")(function* (sessionID: SessionID) {
      const conf = yield* cfg.get()
      if (conf.share === "disabled") {
        yield* new SharePolicyError({ message: "Session sharing is disabled in configuration (share = \"disabled\")." })
      }
      if (!flags.premiumFeatures) {
        yield* new SharePolicyError({
          message: "Session sharing requires a Pro or Enterprise license. Run: arcana license status",
        })
      }
      const result = yield* shareNext.create(sessionID)
      yield* session.setShare({ sessionID, share: { url: result.url } })
      return result
    })

    const unshare = Effect.fn("SessionShare.unshare")(function* (sessionID: SessionID) {
      yield* shareNext.remove(sessionID)
      yield* session.setShare({ sessionID, share: undefined })
    })

    const create = Effect.fn("SessionShare.create")(function* (input?: Session.CreateInput) {
      const result = yield* session.create(input)
      if (result.parentID) return result
      const conf = yield* cfg.get()
      if (!(flags.autoShare || conf.share === "auto")) return result
      yield* share(result.id).pipe(Effect.ignore, Effect.forkIn(scope))
      return result
    })

    return Service.of({ create, share, unshare })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(ShareNext.defaultLayer),
  Layer.provide(Session.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)

export const node = LayerNode.make(layer, [Config.node, Session.node, ShareNext.node, RuntimeFlags.node])

export * as SessionShare from "./session"
