import { Effect } from "effect"
import { PluginV2 } from "../../plugin"
import { importSdk } from "./import-provider"

export const MistralPlugin = PluginV2.define({
  id: PluginV2.ID.make("mistral"),
  effect: Effect.gen(function* () {
    return {
      "aisdk.sdk": Effect.fn(function* (evt) {
        if (evt.package !== "@ai-sdk/mistral") return
        const mod = yield* importSdk("@ai-sdk/mistral")
        evt.sdk = mod.createMistral(evt.options)
      }),
    }
  }),
})
