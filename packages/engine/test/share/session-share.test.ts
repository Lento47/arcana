import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { LayerNode } from "@arcana/core/effect/layer-node"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { SessionShare } from "@/share/session"
import { ShareNext } from "@/share/share-next"
import { testEffect } from "../lib/effect"

/**
 * The share gate must fail with a *typed* policy error and it must not invent
 * refusals.
 *
 * It used to `throw new Error(...)`: a defect, not a typed failure, so the
 * HTTP layer's `Effect.mapError` never saw it and answered every refusal with
 * an empty 500 — the TUI then turned that into a TypeError. It also refused
 * every share on an `ARCANA_PREMIUM` flag that nothing in the repository ever
 * sets; the operator's `share` config is the only gate that remains.
 */
const shareLayer = (share?: "manual" | "auto" | "disabled") =>
  LayerNode.buildLayer(LayerNode.group([SessionShare.node]), {
    replacements: [
      LayerNode.replace(RuntimeFlags.node, RuntimeFlags.layer()),
      LayerNode.replace(Config.node, Layer.mock(Config.Service, { get: () => Effect.succeed({ share } as never) })),
      LayerNode.replace(
        Session.node,
        Layer.mock(Session.Service, { setShare: () => Effect.void }),
      ),
      LayerNode.replace(
        ShareNext.node,
        Layer.mock(ShareNext.Service, {
          create: () => Effect.succeed({ id: "shr_1", url: "https://share.example/shr_1", secret: "s" }),
        }),
      ),
    ],
  })

const itManual = testEffect(shareLayer("manual"))
const itDisabled = testEffect(shareLayer("disabled"))

const sessionID = SessionID.make("ses_share_policy")

describe("SessionShare policy", () => {
  itDisabled.live("a configuration refusal is a typed SharePolicyError naming the setting", () =>
    SessionShare.Service.use((svc) =>
      Effect.gen(function* () {
        const error = yield* svc.share(sessionID).pipe(Effect.flip)

        expect(error).toBeInstanceOf(SessionShare.SharePolicyError)
        expect((error as SessionShare.SharePolicyError).message).toContain("share = \"disabled\"")
      }),
    ),
  )

  itManual.live("a configured share reaches the share service and returns its URL", () =>
    SessionShare.Service.use((svc) =>
      Effect.gen(function* () {
        const result = yield* svc.share(sessionID)

        expect(result.url).toBe("https://share.example/shr_1")
      }),
    ),
  )
})
