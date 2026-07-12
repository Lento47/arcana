import { Effect } from "effect"
import { PluginV2 } from "../../plugin"
import { importSdk } from "./import-provider"

export const TogetherAIPlugin = PluginV2.define({
  id: PluginV2.ID.make("togetherai"),
  effect: Effect.gen(function* () {
    return {
      "aisdk.sdk": Effect.fn(function* (evt) {
        if (evt.package !== "@ai-sdk/togetherai") return
        const mod = yield* importSdk("@ai-sdk/togetherai")
        evt.sdk = mod.createTogetherAI(evt.options)
      }),
    }
  }),
})
