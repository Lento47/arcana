import type { CommandModule } from "yargs"
import { isReservedMemoryKey, openMemoryDB, MemoryStore } from "@arcana/memory"
import { loadConfig, getDataDir, getArcanaHome } from "../../config.js"
import { mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import {
  compileFacts,
  writeFactsMd,
  readFactsMdFile,
  resolveFactsMdPath,
  factsForCloud,
} from "../../facts-md.js"
import { proxyFetch, resolveProxyKey } from "../../proxy-client.js"

type CloudFact = {
  id?: string
  key: string
  value: string
  source?: string
  confidence: number
  createdAt?: string
  updatedAt?: string
  created_at?: string
  updated_at?: string
}

export const MemoryCommand: CommandModule = {
  command: "memory <action>",
  describe: "search, compile FACTS.md, and sync arcana memory",
  builder: (yargs) =>
    yargs
      .positional("action", {
        choices: [
          "search",
          "sessions",
          "facts",
          "stats",
          "artifacts",
          "compile",
          "push",
          "pull",
          "sync",
        ] as const,
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
      })
      .option("min-confidence", {
        type: "number",
        default: 0,
        describe: "min confidence when compiling user_facts into FACTS.md",
      })
      .option("global", {
        type: "boolean",
        default: false,
        describe: "write/read FACTS.md under ~/.arcana instead of project .arcana/",
      })
      .option("path", {
        type: "string",
        describe: "explicit path to FACTS.md (overrides default location)",
      }),
  async handler(args) {
    const config = await loadConfig()
    const dataDir = getDataDir(config)
    await mkdir(dataDir, { recursive: true })
    const db = openMemoryDB(dataDir)
    const store = new MemoryStore(db)
    const action = String(args.action)
    const projectRoot = process.cwd()
    const factsPath =
      (args.path as string | undefined)?.trim() ||
      resolveFactsMdPath({ projectRoot, global: args.global === true })

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
        console.log("No user facts stored in memory.db.")
        console.log(`Compile sheet: arcana memory compile  →  ${factsPath}`)
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
      if (existsSync(factsPath)) console.log(`FACTS.md: ${factsPath}`)
      else console.log(`FACTS.md: (not compiled — run arcana memory compile)`)
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
      if (!artifacts.length) {
        console.log("No artifacts saved.")
        return
      }
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
        const label =
          r.type === "session"
            ? `session:${r.id.slice(0, 8)}`
            : `msg:${r.id.slice(0, 8)} [${r.session_id?.slice(0, 6)}…]`
        console.log(`[${label}] ${r.snippet}`)
      }
      if (artifacts.length) {
        console.log("\nArtifacts:")
        for (const a of artifacts) console.log(`  [artifact:${a.id.slice(0, 8)}] ${a.title}`)
      }
      return
    }

    // --- Compile FACTS.md from user_facts + LEARNED.md + learned/*.md ---
    if (action === "compile") {
      const compiled = compileFacts({
        store,
        projectRoot,
        minConfidence: Number(args["min-confidence"] ?? 0),
      })
      writeFactsMd(factsPath, compiled, { projectRoot })
      const nDb = compiled.filter((f) => f.origin === "user_facts").length
      const nLearned = compiled.length - nDb
      console.log(`Wrote ${compiled.length} fact(s) → ${factsPath}`)
      console.log(`  user_facts: ${nDb}`)
      console.log(`  LEARNED / learned/*: ${nLearned}`)
      console.log(`Push to cloud: arcana memory push`)
      return
    }

    // --- Cloud sync via FACTS.md (proxy /v1/memory) ---
    if (action === "push" || action === "pull" || action === "sync") {
      const key = await resolveProxyKey()
      if (!key) {
        console.error("No proxy key found. Run: arcana console login  (or set ARCANA_PROXY_KEY / ~/.arcana/proxy_key)")
        process.exit(1)
      }

      if (action === "push" || action === "sync") {
        // Always recompile so FACTS.md is fresh from the three sources
        const compiled = compileFacts({
          store,
          projectRoot,
          minConfidence: Number(args["min-confidence"] ?? 0),
        })
        writeFactsMd(factsPath, compiled, { projectRoot })
        console.log(`Compiled ${compiled.length} fact(s) → ${factsPath}`)

        const fromFile = existsSync(factsPath) ? readFactsMdFile(factsPath) : compiled
        const payload = { facts: factsForCloud(fromFile) }
        if (!payload.facts.length) {
          console.log("No facts in FACTS.md to push.")
          if (action === "push") return
        } else {
          const res = await proxyFetch("/v1/memory", { method: "PUT", body: payload })
          if (!res.ok) {
            console.error(
              `Push failed (${res.status || "network"}) via ${res.base || "proxy"}:`,
              res.data?.message || res.data?.error || res.data,
            )
            process.exit(1)
          }
          console.log(
            `Pushed ${payload.facts.length} fact(s) from FACTS.md → cloud (merged ${res.data?.merged ?? "?"} · total ${res.data?.total ?? "?"}) via ${res.base}`,
          )
          console.log("Web: workspace → Memory")
        }
      }

      if (action === "pull" || action === "sync") {
        const res = await proxyFetch("/v1/memory?limit=200")
        if (!res.ok) {
          console.error(
            `Pull failed (${res.status || "network"}) via ${res.base || "proxy"}:`,
            res.data?.message || res.data?.error || res.data,
          )
          process.exit(1)
        }
        const remote = (res.data?.facts ?? []) as CloudFact[]
        if (!remote.length) {
          console.log("No cloud facts to pull.")
          return
        }
        let merged = 0
        for (const f of remote) {
          if (!f.key || !f.value || isReservedMemoryKey(f.key)) continue
          store.recordUserFact(
            f.key,
            f.value,
            f.source ?? "cloud",
            typeof f.confidence === "number" ? f.confidence : 1,
          )
          merged++
        }
        // Refresh FACTS.md after pull so sheet includes cloud+local
        const compiled = compileFacts({ store, projectRoot })
        writeFactsMd(factsPath, compiled, { projectRoot })
        console.log(`Pulled ${merged} cloud fact(s) into memory.db (from ${res.base})`)
        console.log(`Updated ${factsPath}`)
      }
      return
    }
  },
}
