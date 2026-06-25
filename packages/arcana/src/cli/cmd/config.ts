import type { CommandModule } from "yargs"
import { loadConfig, getArcanaHome, type ArcanaConfig } from "../../config.js"
import { readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"

export const ConfigCommand: CommandModule = {
  command: "config [action]",
  describe: "manage arcana configuration",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["show", "init"] as const, default: "show" as const })
      .option("key", { alias: "k", type: "string", describe: "show only this key" }),
  async handler(args) {
    const home = getArcanaHome()
    const configPath = join(home, "config.json")
    const action = String(args.action ?? "show")

    if (action === "init") {
      if (existsSync(configPath)) {
        console.log(`Config exists at ${configPath}. Use 'arcana config show' to view.`)
        return
      }
      const defaults: Partial<ArcanaConfig> = {
        memory: { enabled: true, maxSessions: 1000 },
        cron: { enabled: true, intervalSeconds: 60 },
      }
      await writeFile(configPath, JSON.stringify(defaults, null, 2), "utf8")
      console.log(`Created ${configPath}`)
      console.log("Provider and model are auto-detected from env vars via models.dev.")
      console.log("Set a provider key (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY) to activate.")
      return
    }

    // show
    const config = await loadConfig()
    if (args.key) {
      const key = String(args.key)
      const value = (config as any)[key]
      if (value === undefined) { console.error(`Key not found: ${key}`); process.exit(1) }
      console.log(typeof value === "object" ? JSON.stringify(value, null, 2) : String(value))
      return
    }
    // Redact API key
    const safe = { ...config, apiKey: config.apiKey ? "sk-…" + config.apiKey.slice(-4) : "(not set)" }
    console.log(JSON.stringify(safe, null, 2))
  },
}
