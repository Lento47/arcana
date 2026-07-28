import type { CommandModule } from "yargs"
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { getArcanaHome } from "./arcana-home.js"

export const ConfigCommand: CommandModule = {
  command: "config [action]",
  describe: "manage arcana configuration",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["show", "init"] as const, default: "show" as const })
      .option("key", { alias: "k", type: "string", describe: "show only this key" }),
  async handler(args) {
    const configPath = join(getArcanaHome(), "config.json")
    const action = String(args.action ?? "show")

    if (action === "init") {
      if (existsSync(configPath)) {
        console.log(`Config exists at ${configPath}. Use 'arcana config show' to view.`)
        return
      }
      const defaults = {
        memory: { enabled: true, maxSessions: 1000 },
        cron: { enabled: true, intervalSeconds: 60 },
      }
      mkdirSync(dirname(configPath), { recursive: true })
      writeFileSync(configPath, JSON.stringify(defaults, null, 2), "utf8")
      console.log(`Created ${configPath}`)
      console.log("Provider and model are auto-detected from env vars.")
      console.log("Set a provider key (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY) to activate.")
      return
    }

    if (!existsSync(configPath)) {
      console.log(`No config found at ${configPath}. Run 'arcana config init' to create one.`)
      return
    }
    const config = JSON.parse(readFileSync(configPath, "utf8"))
    if (args.key) {
      const key = String(args.key)
      if (config[key] === undefined) { console.error(`Key not found: ${key}`); process.exit(1) }
      console.log(JSON.stringify(config[key], null, 2))
      return
    }
    console.log(JSON.stringify(config, null, 2))
    console.log(`\n  Config path: ${configPath}`)
    console.log("  Engine config: ~/.config/arcana/arcana.json")
  },
}
