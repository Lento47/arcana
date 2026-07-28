import type { CommandModule } from "yargs"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { getDataDir } from "./arcana-home.js"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { getArcanaHome } from "./arcana-home.js"

export const MemoryCommand: CommandModule = {
  command: "memory <action>",
  describe: "search, compile FACTS.md, and query arcana memory",
  builder: (yargs) =>
    yargs
      .positional("action", {
        choices: ["search", "sessions", "facts", "stats", "artifacts", "compile"] as const,
        demandOption: true,
      })
      .option("query", { alias: "q", type: "string", describe: "search query" })
      .option("limit", { alias: "n", type: "number", default: 10, describe: "max results" })
      .option("min-confidence", { type: "number", default: 0, describe: "min confidence when compiling" }),
  async handler(args) {
    const db = openMemoryDB(getDataDir())
    const store = new MemoryStore(db)
    const action = String(args.action)

    if (action === "search") {
      if (!args.query) { console.error("--query required"); process.exit(1) }
      const q = String(args.query).toLowerCase()
      const allFacts = store.getUserFacts()
      const results = allFacts.filter((f) =>
        f.key.toLowerCase().includes(q) || f.value.toLowerCase().includes(q)
      ).slice(0, Number(args.limit))
      if (!results.length) { console.log("No results."); return }
      for (const r of results) {
        const conf = Math.round((r.confidence ?? 0) * 100)
        console.log(`  [${conf}%] ${r.key}: ${r.value}`)
      }
      return
    }

    if (action === "sessions") {
      const sessions = store.listSessions(Number(args.limit))
      if (!sessions.length) { console.log("No sessions."); return }
      for (const s of sessions) {
        console.log(`  ${s.id.slice(0, 8)}  ${s.title ?? "(untitled)"}  ${s.message_count} msgs`)
      }
      return
    }

    if (action === "facts") {
      const facts = store.getUserFacts().slice(0, Number(args.limit))
      if (!facts.length) { console.log("No facts."); return }
      for (const f of facts) {
        console.log(`  [${Math.round((f.confidence ?? 0) * 100)}%] ${f.key}: ${f.value}`)
      }
      return
    }

    if (action === "stats") {
      const sessions = store.listSessions(10000)
      const facts = store.getUserFacts()
      console.log(`Sessions: ${sessions.length}`)
      console.log(`Facts: ${facts.length}`)
      const totalMsgs = sessions.reduce((sum, s) => sum + (s.message_count ?? 0), 0)
      console.log(`Messages: ${totalMsgs}`)
      const withSummaries = sessions.filter((s) => s.summary).length
      console.log(`Summaries: ${withSummaries}`)
      return
    }

    if (action === "artifacts") {
      const arts = store.listArtifacts(Number(args.limit))
      if (!arts.length) { console.log("No artifacts."); return }
      for (const a of arts) {
        console.log(`  ${a.id.slice(0, 8)}  ${a.name ?? "unnamed"}  ${a.type ?? "?"}`)
      }
      return
    }

    if (action === "compile") {
      const facts = store.getUserFacts(Number(args.minConfidence ?? 0)).slice(0, 10000)
      if (!facts.length) { console.log("No facts to compile."); return }
      const lines = ["# Arcana Learned Facts", "", `Compiled ${new Date().toISOString()}`, `Total facts: ${facts.length}`, ""]
      for (const f of facts) {
        lines.push(`## ${f.key}`)
        lines.push(f.value)
        if (f.source) lines.push(`_source: ${f.source}_`)
        lines.push("")
      }
      const fp = join(getArcanaHome(), "FACTS.md")
      mkdirSync(dirname(fp), { recursive: true })
      writeFileSync(fp, lines.join("\n"), "utf8")
      console.log(`Compiled ${facts.length} facts to ${fp}`)
      return
    }
  },
}
