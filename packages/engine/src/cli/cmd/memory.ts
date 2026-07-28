import type { CommandModule } from "yargs"
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { getArcanaHome } from "./arcana-home.js"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { getDataDir } from "./arcana-home.js"

function resolveDataDir(): string {
  const cp = join(getArcanaHome(), "config.json")
  if (existsSync(cp)) {
    try {
      const cfg = JSON.parse(readFileSync(cp, "utf8"))
      if (typeof cfg.dataDir === "string") return cfg.dataDir
    } catch {}
  }
  return getDataDir()
}

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
    const db = openMemoryDB(resolveDataDir())
    const store = new MemoryStore(db)
    const action = String(args.action)

    if (action === "search") {
      if (!args.query) { console.error("--query required"); process.exit(1) }
      const results = store.search(String(args.query), Number(args.limit))
      if (!results.length) { console.log("No results."); return }
      for (const r of results) {
        const label = r.type === "session"
          ? `session:${r.id.slice(0, 8)}`
          : `msg:${r.id.slice(0, 8)} [${r.session_id?.slice(0, 6)}\u2026]`
        console.log(`[${label}] ${r.snippet}`)
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
        console.log(`  [${a.id.slice(0, 8)}] ${a.title}${a.tags ? ` (${a.tags})` : ""}  ${a.created_at.slice(0, 10)}`)
      }
      return
    }

    if (action === "compile") {
      const facts = store.getUserFacts(Number(args["min-confidence"] ?? 0)).slice(0, 10000)
      const lines = ["# Arcana Compiled Facts", "", `Compiled ${new Date().toISOString()}`, `User facts from memory.db: ${facts.length}`, ""]

      // User facts from memory.db
      for (const f of facts) {
        lines.push(`## ${f.key}`)
        lines.push(f.value)
        if (f.source) lines.push(`_source: ${f.source}_`)
        lines.push("")
      }

      // LEARNED.md entries
      const projectRoot = process.cwd()
      const learnedMd = join(projectRoot, ".arcana", "LEARNED.md")
      if (existsSync(learnedMd)) {
        lines.push("## From LEARNED.md", "")
        try {
          const md = readFileSync(learnedMd, "utf8")
          lines.push(md, "")
        } catch {}
      }

      // learned/*.md entries
      const learnedDir = join(projectRoot, ".arcana", "learned")
      if (existsSync(learnedDir)) {
        try {
          const entries = readdirSync(learnedDir).filter((f) => f.endsWith(".md")).sort()
          for (const f of entries) {
            lines.push(`## ${f.replace(".md", "")}`, "")
            try { lines.push(readFileSync(join(learnedDir, f), "utf8"), "") } catch {}
          }
        } catch {}
      }

      const fp = join(getArcanaHome(), "FACTS.md")
      mkdirSync(dirname(fp), { recursive: true })
      writeFileSync(fp, lines.join("\n"), "utf8")
      console.log(`Compiled facts to ${fp}`)
      console.log(`  user_facts: ${facts.length}`)
      return
    }
  },
}
