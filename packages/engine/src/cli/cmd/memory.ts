import type { CommandModule } from "yargs"
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { getArcanaHome } from "./arcana-home.js"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { getDataDir } from "./arcana-home.js"

// ── helpers ──────────────────────────────────────────────────────────

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

/** Proxy key from env var or ~/.arcana/proxy_key file. */
function resolveProxyKey(): string | null {
  if (process.env.ARCANA_PROXY_KEY?.trim()) return process.env.ARCANA_PROXY_KEY.trim()
  const kp = join(getArcanaHome(), "proxy_key")
  if (existsSync(kp)) {
    try { const k = readFileSync(kp, "utf8").trim(); if (k) return k } catch {}
  }
  return null
}

const PROXY_BASES = [
  process.env.ARCANA_PROXY_URL?.replace(/\/$/, ""),
  "https://proxy-arcana.otnelhq.com",
  "https://arcana-proxy.lejzerv.workers.dev",
].filter(Boolean) as string[]

type ProxyResult = { ok: boolean; status: number; data: any; base: string }

async function proxyFetch(path: string, opts: { method?: string; body?: unknown } = {}): Promise<ProxyResult> {
  const key = resolveProxyKey()
  if (!key) return { ok: false, status: 0, data: { error: "no_proxy_key" }, base: "" }

  let last: ProxyResult = { ok: false, status: 0, data: { error: "unreachable" }, base: PROXY_BASES[0] ?? "" }
  for (const base of PROXY_BASES) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: opts.method ?? "GET",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(12_000),
      })
      const text = await res.text()
      let data: any = {}
      try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text.slice(0, 200) } }
      last = { ok: res.ok, status: res.status, data, base }
      if (res.ok || res.status < 500) return last
    } catch (e) {
      last = { ok: false, status: 0, data: { error: "network", message: String(e) }, base }
    }
  }
  return last
}

function compileFacts(store: MemoryStore): { key: string; value: string; source?: string; confidence: number }[] {
  const facts = store.getUserFacts().slice(0, 10000)
  return facts.map((f) => ({
    key: f.key,
    value: f.value,
    source: f.source,
    confidence: f.confidence,
  }))
}

// ── command ──────────────────────────────────────────────────────────

export const MemoryCommand: CommandModule = {
  command: "memory <action>",
  describe: "search, compile, and sync arcana memory",
  builder: (yargs) =>
    yargs
      .positional("action", {
        choices: ["search", "sessions", "facts", "stats", "artifacts", "compile", "push", "pull", "sync"] as const,
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

      for (const f of facts) {
        lines.push(`## ${f.key}`)
        lines.push(f.value)
        if (f.source) lines.push(`_source: ${f.source}_`)
        lines.push("")
      }

      const projectRoot = process.cwd()
      const learnedMd = join(projectRoot, ".arcana", "LEARNED.md")
      if (existsSync(learnedMd)) {
        lines.push("## From LEARNED.md", "")
        try { lines.push(readFileSync(learnedMd, "utf8"), "") } catch {}
      }

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

    // ── cloud sync ────────────────────────────────────────────────

    if (action === "push" || action === "pull" || action === "sync") {
      const key = resolveProxyKey()
      if (!key) {
        console.error("No proxy key found. Run: arcana console login  (or set ARCANA_PROXY_KEY / ~/.arcana/proxy_key)")
        process.exit(1)
      }

      if (action === "push" || action === "sync") {
        const facts = compileFacts(store)
        if (!facts.length) {
          console.log("No facts to push.")
          if (action === "push") return
        } else {
          const res = await proxyFetch("/v1/memory", { method: "PUT", body: { facts } })
          if (!res.ok) {
            console.error(`Push failed (${res.status}) via ${res.base}:`, res.data?.message || res.data?.error || res.data)
            process.exit(1)
          }
          console.log(`Pushed ${facts.length} fact(s) → cloud (merged ${res.data?.merged ?? "?"} · total ${res.data?.total ?? "?"}) via ${res.base}`)
          console.log("Web: workspace → Memory")
        }
      }

      if (action === "pull" || action === "sync") {
        const res = await proxyFetch("/v1/memory?limit=200")
        if (!res.ok) {
          console.error(`Pull failed (${res.status}) via ${res.base}:`, res.data?.message || res.data?.error || res.data)
          process.exit(1)
        }
        const remote = (res.data?.facts ?? []) as Array<{ key?: string; value?: string; source?: string; confidence?: number }>
        if (!remote.length) { console.log("No cloud facts to pull."); return }
        let merged = 0
        for (const f of remote) {
          if (!f.key || !f.value) continue
          store.recordUserFact(f.key, f.value, f.source ?? "cloud", typeof f.confidence === "number" ? f.confidence : 1)
          merged++
        }
        console.log(`Pulled ${merged} cloud fact(s) into memory.db (from ${res.base})`)
      }
      return
    }
  },
}
