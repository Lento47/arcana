import { Effect } from "effect"
import { effectCmd } from "../../effect-cmd"
import { outputJson } from "../../json-output"

export const ConfigCommand = effectCmd({
  command: "config",
  describe: "show resolved configuration",
  builder: (yargs) => yargs,
  handler: Effect.fn("Cli.debug.config")(function* () {
    const { Config } = yield* Effect.promise(() => import("@/config/config"))
    const config = yield* Config.Service.use((cfg) => cfg.get())
    outputJson(config)
  }),
})
