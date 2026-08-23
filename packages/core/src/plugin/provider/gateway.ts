import { Effect } from "effect"
import { PluginV2 } from "../../plugin"
import { importSdk } from "./import-provider"

export function makeGatewayPlugin(loadGateway = () => importSdk("@ai-sdk/gateway")) {
  return PluginV2.define({
    id: PluginV2.ID.make("gateway"),
    effect: Effect.gen(function* () {
      return {
        "aisdk.sdk": Effect.fn(function* (evt) {
          if (evt.package !== "@ai-sdk/gateway") return
          const mod = yield* loadGateway()
          evt.sdk = mod.createGateway(evt.options)
        }),
      }
    }),
  })
}

export const GatewayPlugin = makeGatewayPlugin()
