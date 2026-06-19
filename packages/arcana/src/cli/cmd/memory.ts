import type { CommandModule } from "yargs"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { loadConfig, getDataDir } from "../../config.js"
import { mkdir } from "node:fs/promises"

export const MemoryCommand: CommandModule = {
  command: "memory <action>",
  describe: "search and inspect arcana memory",
  builder: (yargs) =>
    yargs
      .positional("action", {
        choices: ["search", "sessions", "facts", "stats", "artifacts"] as const,
        demandOption: true,
      })
      .option("query", {
        alias: "q",
        type: "string",
        describe: "search query",
      })
      .option("limit", {
        alias: "n",
        type: "number",
        default: 10,
        describe: "max results",
      }),
  async handler(args) {
    const config = await loadConfig()
    const dataDir = getDataDir(config)
    await mkdir(dataDir, { recursive: true })
    const db = openMemoryDB(dataDir)
    const store = new MemoryStore(db)
    const action = String(args.action)

    if (action === "sessions") {
      const sessions = store.listSessions(Number(args.limit))
      if (!sessions.length) {
        console.log("No sessions found.")
        return
      }
      for (const s of sessions) {
        console.log(`${s.id.slice(0, 8)}…  ${(s.title ?? "(untitled)").padEnd(40)}  ${s.message_count} msgs  ${s.updated_at}`)
      }
      return
    }

    if (action === "facts") {
      const facts = store.getUserFacts()
      if (!facts.length) {
        console.log("No user facts stored.")
        return
      }
      for (const f of facts) {
        const pct = Math.round(f.confidence * 100)
        console.log(`${f.key.padEnd(30)}  ${pct}%  ${f.value}`)
      }
      return
    }

    if (action === "stats") {
      const sessions = store.listSessions(1000)
      const facts = store.getUserFacts()
      const topFacts = store.getTopFacts(5, 0.5)
      const skillStats = store.getRecentSkillStats(10)
      console.log(`Sessions: ${sessions.length}`)
      console.log(`User facts: ${facts.length} (${facts.filter((f) => f.confidence >= 0.5).length} high-confidence)`)
      if (topFacts.length) {
        console.log("\nTop facts:")
        for (const f of topFacts) console.log(`  ${f.key}: ${f.value} (${Math.round(f.confidence * 100)}%)`)
      }
      if (skillStats.length) {
        console.log("\nTop skills (7-day):")
        for (const s of skillStats) console.log(`  ${s.skillId.padEnd(30)} ${s.recent} recent / ${s.total} total`)
      }
      return
    }

    if (action === "artifacts") {
      const artifacts = store.listArtifacts(Number(args.limit))
      if (!artifacts.length) { console.log("No artifacts saved."); return }
      for (const a of artifacts) {
        console.log(`[${a.id.slice(0, 8)}] ${a.title}${a.tags ? ` (${a.tags})` : ""}  ${a.created_at.slice(0, 10)}`)
      }
      console.log(`\n  arcana memory search --query <q>   to search artifacts`)
      return
    }

    if (action === "search") {
      if (!args.query) {
        console.error("--query required for search")
        process.exit(1)
      }
      const results = store.search(String(args.query), Number(args.limit))
      const artifacts = store.searchArtifacts(String(args.query), 5)
      if (!results.length && !artifacts.length) {
        console.log("No results.")
        return
      }
      for (const r of results) {
        const label = r.type === "session" ? `session:${r.id.slice(0, 8)}` : `msg:${r.id.slice(0, 8)} [${r.session_id?.slice(0, 6)}…]`
        console.log(`[${label}] ${r.snippet}`)
      }
      if (artifacts.length) {
        console.log("\nArtifacts:")
        for (const a of artifacts) console.log(`  [artifact:${a.id.slice(0, 8)}] ${a.title}`)
      }
      return
    }
  },
}
