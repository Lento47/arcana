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
 * The share gate must fail with a *typed* policy error.
 *
 * It used to `throw new Error(...)`: a defect, not a typed failure, so the
 * HTTP layer's `Effect.mapError` never saw it and answered every refusal with
 * an empty 500. The TUI then read `res.data!.share!.url` off that empty body
 * and showed a TypeError — "share session is broken" started here.
 */
const shareLayer = (input: { premiumFeatures: boolean; share?: "manual" | "auto" | "disabled" }) =>
  LayerNode.buildLayer(LayerNode.group([SessionShare.node]), {
    replacements: [
      LayerNode.replace(RuntimeFlags.node, RuntimeFlags.layer({ premiumFeatures: input.premiumFeatures })),
      LayerNode.replace(Config.node, Layer.mock(Config.Service, { get: () => Effect.succeed({ share: input.share } as never) })),
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

const itUnlicensed = testEffect(shareLayer({ premiumFeatures: false }))
const itLicensed = testEffect(shareLayer({ premiumFeatures: true }))
const itDisabled = testEffect(shareLayer({ premiumFeatures: true, share: "disabled" }))

const sessionID = SessionID.make("ses_share_policy")

describe("SessionShare policy", () => {
  itUnlicensed.live("a license refusal is a typed SharePolicyError, not a defect", () =>
    SessionShare.Service.use((svc) =>
      Effect.gen(function* () {
        const error = yield* svc.share(sessionID).pipe(Effect.flip)

        expect(error).toBeInstanceOf(SessionShare.SharePolicyError)
        expect((error as SessionShare.SharePolicyError).message).toContain("requires a Pro or Enterprise license")
      }),
    ),
  )

  itDisabled.live("a configuration refusal names the setting", () =>
    SessionShare.Service.use((svc) =>
      Effect.gen(function* () {
        const error = yield* svc.share(sessionID).pipe(Effect.flip)

        expect(error).toBeInstanceOf(SessionShare.SharePolicyError)
        expect((error as SessionShare.SharePolicyError).message).toContain("share = \"disabled\"")
      }),
    ),
  )

  itLicensed.live("an entitled share reaches the share service and returns its URL", () =>
    SessionShare.Service.use((svc) =>
      Effect.gen(function* () {
        const result = yield* svc.share(sessionID)

        expect(result.url).toBe("https://share.example/shr_1")
      }),
    ),
  )
})
