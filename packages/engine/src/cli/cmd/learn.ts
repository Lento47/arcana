import type { CommandModule } from "yargs"
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { cwd } from "node:process"

const LEARNED_DIR = join(cwd(), ".arcana", "learned")
const LEARNED_MD = join(cwd(), ".arcana", "LEARNED.md")

export const LearnCommand: CommandModule = {
  command: "learn [action]",
  describe: "view and manage learned knowledge",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["list", "show", "moc"] as const, default: "list" as const })
      .option("slug", { alias: "s", type: "string", describe: "wiki entry slug to show" }),
  async handler(args) {
    const action = String(args.action ?? "list")

    if (action === "moc") {
      if (!existsSync(LEARNED_MD)) {
        console.log("No LEARNED.md found. Learnings are created after sessions with >2 turns.")
        return
      }
      console.log(readFileSync(LEARNED_MD, "utf8"))
      return
    }

    if (!existsSync(LEARNED_DIR)) {
      console.log("No learned entries yet. Run arcana in REPL mode, chat for >2 turns, then /exit.")
      return
    }

    if (action === "show") {
      if (!args.slug) { console.error("--slug required"); process.exit(1) }
      const fp = join(LEARNED_DIR, `${String(args.slug)}.md`)
      if (!existsSync(fp)) { console.error(`Entry not found: ${args.slug}`); process.exit(1) }
      console.log(readFileSync(fp, "utf8"))
      return
    }

    // list
    const files = readdirSync(LEARNED_DIR).filter((f) => f.endsWith(".md"))
    if (!files.length) { console.log("No entries."); return }
    console.log(`${files.length} learned entries:\n`)
    for (const f of files.sort()) {
      const raw = readFileSync(join(LEARNED_DIR, f), "utf8")
      const firstLine = raw.split("\n")[0]?.replace(/^#+\s*/, "") ?? f
      console.log(`  ${f.replace(".md", "")}  \u2014  ${firstLine.slice(0, 80)}`)
    }
  },
}
