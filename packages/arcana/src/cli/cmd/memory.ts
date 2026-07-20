import type { CommandModule } from "yargs"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { loadConfig, getDataDir, getArcanaHome } from "../../config.js"
import { mkdir, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"

const PROXY_BASES = [
  process.env.ARCANA_PROXY_URL?.replace(/\/$/, ""),
  "https://proxy.arcana.otnelhq.com",
  "https://arcana-proxy.lejzerv.workers.dev",
].filter(Boolean) as string[]

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

async function resolveProxyKey(): Promise<string | null> {
  if (process.env.ARCANA_PROXY_KEY?.trim()) return process.env.ARCANA_PROXY_KEY.trim()
  try {
    const keyPath = join(getArcanaHome(), "proxy_key")
    if (existsSync(keyPath)) {
      const key = (await readFile(keyPath, "utf8")).trim()
      if (key) return key
    }
  } catch {}
  return null
}

async function proxyMemoryFetch(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: any; base: string }> {
  const key = await resolveProxyKey()
  if (!key) {
    return { ok: false, status: 0, data: { error: "no_proxy_key" }, base: "" }
  }
  let last: { ok: boolean; status: number; data: any; base: string } = {
    ok: false,
    status: 0,
    data: { error: "unreachable" },
    base: PROXY_BASES[0] ?? "",
  }
  for (const base of PROXY_BASES) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: opts.method ?? "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(15000),
      })
      const text = await res.text()
      let data: any = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        data = { raw: text.slice(0, 200) }
      }
      last = { ok: res.ok, status: res.status, data, base }
      // Don't fall through on auth errors — key is wrong, not the host
      if (res.status === 401 || res.status === 403) return last
      if (res.ok || res.status < 500) return last
    } catch (e) {
      last = {
        ok: false,
        status: 0,
        data: { error: "network", message: String(e) },
        base,
      }
    }
  }
  return last
}

export const MemoryCommand: CommandModule = {
  command: "memory <action>",
  describe: "search and inspect arcana memory",
  builder: (yargs) =>
    yargs
      .positional("action", {
        choices: ["search", "sessions", "facts", "stats", "artifacts", "push", "pull", "sync"] as const,
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

    // --- Cloud sync (proxy /v1/memory) ---
    if (action === "push" || action === "pull" || action === "sync") {
      const key = await resolveProxyKey()
      if (!key) {
        console.error("No proxy key found. Run: arcana console login  (or set ARCANA_PROXY_KEY / ~/.arcana/proxy_key)")
        process.exit(1)
      }

      if (action === "push" || action === "sync") {
        const local = store.getUserFacts()
        if (!local.length && action === "push") {
          console.log("No local facts to push.")
          if (action === "push") return
        } else if (local.length) {
          const payload = {
            facts: local.map((f) => ({
              id: f.id,
              key: f.key,
              value: f.value,
              source: f.source ?? "cli",
              confidence: f.confidence,
              createdAt: f.created_at,
              updatedAt: f.updated_at,
            })),
          }
          const res = await proxyMemoryFetch("/v1/memory", { method: "PUT", body: payload })
          if (!res.ok) {
            console.error(`Push failed (${res.status || "network"}) via ${res.base || "proxy"}:`, res.data?.message || res.data?.error || res.data)
            process.exit(1)
          }
          console.log(`Pushed ${payload.facts.length} local fact(s) → cloud (merged ${res.data?.merged ?? "?"} · total ${res.data?.total ?? "?"}) via ${res.base}`)
        }
      }

      if (action === "pull" || action === "sync") {
        const res = await proxyMemoryFetch("/v1/memory?limit=200")
        if (!res.ok) {
          console.error(`Pull failed (${res.status || "network"}) via ${res.base || "proxy"}:`, res.data?.message || res.data?.error || res.data)
          process.exit(1)
        }
        const remote = (res.data?.facts ?? []) as CloudFact[]
        if (!remote.length) {
          console.log("No cloud facts to pull.")
          return
        }
        let merged = 0
        for (const f of remote) {
          if (!f.key || !f.value) continue
          store.recordUserFact(f.key, f.value, f.source ?? "cloud", typeof f.confidence === "number" ? f.confidence : 1)
          merged++
        }
        console.log(`Pulled ${merged} cloud fact(s) into local memory (from ${res.base})`)
        console.log("View on web: workspace → Memory")
      }
      return
    }
  },
}
