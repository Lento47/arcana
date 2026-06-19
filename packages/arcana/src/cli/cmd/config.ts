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
        provider: "openai",
        model: "gpt-4o",
        utilityModel: "gpt-4o-mini",
        memory: { enabled: true, maxSessions: 1000 },
        cron: { enabled: true, intervalSeconds: 60 },
      }
      await writeFile(configPath, JSON.stringify(defaults, null, 2), "utf8")
      console.log(`Created ${configPath}`)
      console.log("Edit this file to configure arcana, or set ARCANA_PROVIDER / ARCANA_MODEL / ARCANA_API_KEY env vars.")
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
