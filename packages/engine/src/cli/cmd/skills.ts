import type { CommandModule } from "yargs"
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join, dirname, relative } from "node:path"
import { homedir } from "node:os"
import matter from "gray-matter"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { getDataDir, getArcanaHome } from "./arcana-home.js"

interface SkillEntry {
  name: string
  description: string
  id: string
  category: string
  path: string
}

function loadSkillDirs(): string[] {
  const cp = join(getArcanaHome(), "config.json")
  if (existsSync(cp)) {
    try {
      const cfg = JSON.parse(readFileSync(cp, "utf8"))
      if (Array.isArray(cfg.skillsDirs) && cfg.skillsDirs.length > 0) return cfg.skillsDirs
    } catch {}
  }
  // Default: home skills + cwd skills
  return [
    join(homedir(), ".arcana", "skills"),
    join(process.cwd(), "skills"),
    join(process.cwd(), ".arcana", "skills"),
  ]
}

function scanDir(dir: string): SkillEntry[] {
  if (!existsSync(dir)) return []
  const results: SkillEntry[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) { results.push(...scanDir(full)); continue }
      if (e.name !== "SKILL.md") continue
      try {
        const raw = readFileSync(full, "utf8")
        const parsed = matter(raw)
        const meta = parsed.data as { name?: string; description?: string; category?: string }
        if (!meta.name) continue
        const relDir = relative(dir, dirname(full))
        results.push({
          name: meta.name,
          description: meta.description ?? "",
          id: relDir.replace(/[\\/]/g, "/") || meta.name.toLowerCase().replace(/\s+/g, "-"),
          category: meta.category || relDir.split(/[\\/]/)[0] || "misc",
          path: full,
        })
      } catch {}
    }
  } catch {}
  return results
}

function scanAll(): SkillEntry[] {
  const all: SkillEntry[] = []
  const dirs = loadSkillDirs()
  for (const dir of dirs) all.push(...scanDir(dir))
  return all
}

function loadSkillBody(id: string): string | undefined {
  for (const dir of loadSkillDirs()) {
    const fp = join(dir, id, "SKILL.md")
    if (existsSync(fp)) return readFileSync(fp, "utf8")
  }
}

export const SkillsCommand: CommandModule = {
  command: "skills [action]",
  describe: "manage and browse arcana skills",
  builder: (yargs) =>
    yargs
      .positional("action", { choices: ["list", "info", "search", "ranked"] as const, default: "list" as const })
      .option("query", { alias: "q", type: "string", describe: "search query" })
      .option("skill", { alias: "s", type: "string", describe: "skill id for info" })
      .option("category", { alias: "c", type: "string", describe: "filter by category" }),
  async handler(args) {
    const action = String(args.action ?? "list")
    const skills = scanAll()

    if (action === "search") {
      const q = String(args.query ?? "").toLowerCase()
      const hits = skills.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      if (!hits.length) { console.log(`No skills match "${args.query}"`); return }
      console.log(`${hits.length} matching skills:\n`)
      for (const s of hits) console.log(`  ${s.id.padEnd(36)} ${s.description}`)
      return
    }

    if (action === "ranked") {
      const db = openMemoryDB(getDataDir())
      const mem = new MemoryStore(db)
      const stats = mem.getRecentSkillStats(50)
      if (!stats.length) { console.log("No skill usage data yet."); return }
      const statMap = new Map(stats.map((s) => [s.skillId, s]))
      const ranked = skills
        .filter((s) => statMap.has(s.id) || statMap.has(s.name.toLowerCase()))
        .map((s) => ({ ...s, stat: statMap.get(s.id) ?? statMap.get(s.name.toLowerCase())! }))
        .sort((a, b) => (b.stat.recent || b.stat.total) - (a.stat.recent || a.stat.total))
      console.log(`${ranked.length} ranked skills:\n`)
      for (const s of ranked.slice(0, 20)) {
        console.log(`  ${s.id.padEnd(36)} ${String(s.stat.recent ?? 0).padEnd(5)} ${s.description}`)
      }
      return
    }

    if (action === "info") {
      if (!args.skill) { console.error("--skill required"); process.exit(1) }
      const skill = skills.find((s) => s.id === String(args.skill) || s.name.toLowerCase().includes(String(args.skill).toLowerCase()))
      if (!skill) { console.error(`Skill not found: ${args.skill}`); process.exit(1) }
      const body = loadSkillBody(skill.id) ?? readFileSync(skill.path, "utf8")
      console.log(`# ${skill.name}\n`)
      console.log(`ID: ${skill.id}  |  Category: ${skill.category}`)
      if (skill.description) console.log(`\n${skill.description}`)
      console.log(`\n---\n${body}`)
      return
    }

    // list
    let filtered = skills
    if (args.category) filtered = filtered.filter((s) => s.category === String(args.category))
    if (!filtered.length) { console.log("No skills found."); return }
    const cats = [...new Set(filtered.map((s) => s.category))]
    for (const cat of cats.sort()) {
      console.log(`\n${cat}:`)
      for (const s of filtered.filter((s) => s.category === cat)) {
        console.log(`  ${s.id.padEnd(36)} ${s.description}`)
      }
    }
  },
}
