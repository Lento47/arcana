import type { CommandModule } from "yargs"
import { readFileSync, existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const THEMES = ["arcana", "bloodmoon", "coven", "crypt", "dragon", "lich", "wraith"] as const
const TUI_CONFIG = join(homedir(), ".config", "arcana", "tui.json")

export const ThemeCommand: CommandModule = {
  command: "theme [action]",
  describe: "list and set arcana themes",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["list", "set"] as const, default: "list" as const })
      .option("name", { alias: "n", type: "string", choices: THEMES as unknown as string[], describe: "theme name" }),
  async handler(args) {
    const action = String(args.action ?? "list")

    if (action === "set") {
      if (!args.name) { console.error("--name required. Choices: " + THEMES.join(", ")); process.exit(1) }
      const name = String(args.name)
      let config: Record<string, unknown> = {}
      if (existsSync(TUI_CONFIG)) {
        try { config = JSON.parse(readFileSync(TUI_CONFIG, "utf8")) } catch {}
      }
      config.theme = name
      writeFileSync(TUI_CONFIG, JSON.stringify(config, null, 2), "utf8")
      console.log(`Theme set to "${name}". Restart arcana to apply.`)
      return
    }

    // list
    const current = (() => {
      if (!existsSync(TUI_CONFIG)) return "arcana"
      try {
        const c = JSON.parse(readFileSync(TUI_CONFIG, "utf8"))
        return (c.theme as string) ?? "arcana"
      } catch { return "arcana" }
    })()

    console.log("7 arcane themes:\n")
    for (const t of THEMES) {
      console.log(`  ${t === current ? "◆" : " "} ${t}${t === current ? " ← active" : ""}`)
    }
    console.log("\n  arcana theme set --name <name>   to switch")
  },
}
