import { Effect } from "effect"
import { PluginV2 } from "../../plugin"
import { importSdk } from "./import-provider"

export const GooglePlugin = PluginV2.define({
  id: PluginV2.ID.make("google"),
  effect: Effect.gen(function* () {
    return {
      "aisdk.sdk": Effect.fn(function* (evt) {
        if (evt.package !== "@ai-sdk/google") return
        const mod = yield* importSdk("@ai-sdk/google")
        evt.sdk = mod.createGoogleGenerativeAI(evt.options)
      }),
    }
  }),
})
