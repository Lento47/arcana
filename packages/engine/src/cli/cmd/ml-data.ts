import { mkdirSync } from "node:fs"
import type { CommandModule } from "yargs"

import { LearningStore, openMemoryDB, runLearningDataCommand } from "@arcana/memory"
import { memoryDataDir } from "../../memory/paths.js"

export const MlDataCommand: CommandModule = {
  command: "ml-data [action..]",
  describe: "manage consented local Signal Engine learning data",
  builder: (yargs) =>
    yargs
      .positional("action", { type: "string", array: true })
      .option("scope", { choices: ["device", "workspace"] as const, default: "workspace" })
      .option("retention-days", { type: "number", default: 30 })
      .option("yes", { type: "boolean", default: false })
      .option("output", { type: "string" })
      .option("include-content", { type: "boolean", default: false })
      .option("acknowledge-private-data", { type: "boolean", default: false })
      .option("positive", { type: "boolean", default: false })
      .option("negative", { type: "boolean", default: false })
      .option("limit", { alias: "n", type: "number", default: 20 }),
  handler(args) {
    const dataDir = memoryDataDir()
    mkdirSync(dataDir, { recursive: true })
    const store = new LearningStore(openMemoryDB(dataDir))
    try {
      const command = runLearningDataCommand(store, process.cwd(), {
        action: (args.action as string[] | undefined)?.map(String),
        scope: args.scope as "device" | "workspace",
        retentionDays: Number(args.retentionDays),
        yes: args.yes === true,
        output: args.output as string | undefined,
        includeContent: args.includeContent === true,
        acknowledgePrivateData: args.acknowledgePrivateData === true,
        positive: args.positive === true,
        negative: args.negative === true,
        limit: Number(args.limit),
        // This labels the local invocation surface; authorization still comes
        // from the explicit consent decision itself, never from this hint.
        source: process.env.ARCANA_ML_CONSENT_SOURCE === "tui" ? "tui" : "cli",
      })
      for (const line of command.output) console.log(line)
      for (const line of command.errors) console.error(line)
      if (command.exitCode) process.exitCode = command.exitCode
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  },
}
