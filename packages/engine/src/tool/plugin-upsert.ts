import { pathToFileURL } from "node:url"
import { Effect, Schema } from "effect"
import { Config } from "@/config/config"
import { mergePluginSpec, upsertPlugin } from "@/plugin/upsert"
import * as Tool from "./tool"

const Params = Schema.Struct({
  id: Schema.String.annotate({ description: "Stable plugin id (kebab-case). Same id updates in place." }),
  description: Schema.String.annotate({ description: "What this plugin's tool does" }),
  source: Schema.String.annotate({
    description:
      "TypeScript source for a local @arcana/plugin tool plugin. Use tool() from @arcana/plugin. No spawn, fetch, eval, or filesystem writes.",
  }),
})

export const PluginUpsertTool = Tool.define(
  "plugin_upsert",
  Effect.gen(function* () {
    const config = yield* Config.Service
    return {
      description:
        "Write or update a local tool plugin under ~/.arcana/plugins/<id>. Same id overwrites (never duplicates). Registers the plugin in global config so the next engine start loads it. Source must not spawn processes, use the network, or eval.",
      parameters: Params,
      execute: (params: Schema.Schema.Type<typeof Params>) =>
        Effect.gen(function* () {
          const result = upsertPlugin({
            id: params.id,
            description: params.description,
            source: params.source,
          })
          if (!result.ok) {
            return {
              title: "plugin rejected",
              output: result.detail,
              metadata: { denied: true, id: "", created: false },
            }
          }
          const spec = pathToFileURL(result.path).href
          const global = yield* config.getGlobal()
          const merged = mergePluginSpec(global.plugin, spec)
          if (merged.added) {
            yield* config.updateGlobal({ plugin: merged.next })
          }
          const verb = result.created ? "created" : "updated"
          return {
            title: `plugin ${verb}`,
            output: [
              `Plugin ${verb}: ${result.id}`,
              `Stored at ${result.path}`,
              merged.added
                ? "Registered in global config. Restart the engine to load the new tool."
                : "Already registered in global config. Restart the engine if the previous load is stale.",
            ].join("\n"),
            metadata: { denied: false, id: result.id, created: result.created },
          }
        }),
    }
  }),
)
