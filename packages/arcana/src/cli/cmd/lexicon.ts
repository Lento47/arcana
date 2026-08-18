import type { CommandModule } from "yargs"
import { readFileSync, existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const VOICES = ["arcane", "plain"] as const
const TUI_CONFIG = join(homedir(), ".config", "arcana", "tui.json")

export const LexiconCommand: CommandModule = {
  command: "lexicon [action]",
  describe: "list and set the arcana TUI interface voice",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["list", "set"] as const, default: "list" as const })
      .option("name", { alias: "n", type: "string", choices: VOICES as unknown as string[], describe: "voice name" }),
  async handler(args) {
    const action = String(args.action ?? "list")

    if (action === "set") {
      if (!args.name) { console.error("--name required. Choices: " + VOICES.join(", ")); process.exit(1) }
      const name = String(args.name)
      let config: Record<string, unknown> = {}
      if (existsSync(TUI_CONFIG)) {
        try { config = JSON.parse(readFileSync(TUI_CONFIG, "utf8")) } catch {}
      }
      config.lexicon = name
      writeFileSync(TUI_CONFIG, JSON.stringify(config, null, 2), "utf8")
      console.log(`Lexicon set to "${name}". Restart arcana to apply.`)
      return
    }

    // list
    const current = (() => {
      if (!existsSync(TUI_CONFIG)) return "arcane"
      try {
        const c = JSON.parse(readFileSync(TUI_CONFIG, "utf8"))
        return (c.lexicon as string) ?? "arcane"
      } catch { return "arcane" }
    })()

    console.log("2 interface voices:\n")
    for (const v of VOICES) {
      console.log(`  ${v === current ? "◆" : " "} ${v}${v === current ? " ← active" : ""}`)
    }
    console.log("\n  arcana lexicon set --name <name>   to switch (restart to apply)")
  },
}
