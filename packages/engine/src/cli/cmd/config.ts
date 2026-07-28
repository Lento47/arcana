import type { CommandModule } from "yargs"
import { readFileSync, existsSync, mkdirSync } from "node:fs"
import { atomicWriteSync } from "../../util/atomic-write"
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
      atomicWriteSync(configPath, JSON.stringify(defaults, null, 2))
      console.log(`Created ${configPath}`)
      console.log("Provider and model are auto-detected from env vars via models.dev.")
      console.log("Set a provider key (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY) to activate.")
      return
    }

    // show — load file + merge env var overrides for display
    let config: Record<string, unknown> = {}
    if (existsSync(configPath)) {
      try { config = JSON.parse(readFileSync(configPath, "utf8")) } catch {}
    }

    // Env var overrides (mirrors loadConfig() behaviour for display)
    if (process.env.ARCANA_PROVIDER) config.provider = process.env.ARCANA_PROVIDER
    if (process.env.ARCANA_MODEL) config.model = process.env.ARCANA_MODEL
    if (process.env.ARCANA_API_KEY) config.apiKey = process.env.ARCANA_API_KEY

    // Redact API key in display
    const display = { ...config }
    if (typeof display.apiKey === "string" && (display.apiKey as string).length > 4) {
      display.apiKey = "sk-\u2026" + (display.apiKey as string).slice(-4)
    } else if (!display.apiKey) {
      display.apiKey = "(not set)"
    }

    if (args.key) {
      const key = String(args.key)
      const val = display[key]
      if (val === undefined) { console.error(`Key not found: ${key}`); process.exit(1) }
      console.log(typeof val === "object" ? JSON.stringify(val, null, 2) : String(val))
      return
    }
    console.log(JSON.stringify(display, null, 2))
    console.log(`\n  Config path: ${configPath}`)
    console.log("  Engine config: ~/.config/arcana/arcana.json")
  },
}
