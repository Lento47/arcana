import { Effect } from "effect"
import { PluginV2 } from "../../plugin"
import { importSdk } from "./import-provider"

export const CoherePlugin = PluginV2.define({
  id: PluginV2.ID.make("cohere"),
  effect: Effect.gen(function* () {
    return {
      "aisdk.sdk": Effect.fn(function* (evt) {
        if (evt.package !== "@ai-sdk/cohere") return
        const mod = yield* importSdk("@ai-sdk/cohere")
        evt.sdk = mod.createCohere(evt.options)
      }),
    }
  }),
})
