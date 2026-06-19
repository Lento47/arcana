import type { CommandModule } from "yargs"
import { loadSkills, loadSkillBody } from "../../skills/loader.js"
import { loadConfig, getDataDir } from "../../config.js"
import { openMemoryDB, MemoryStore } from "@arcana/memory"

export const SkillsCommand: CommandModule = {
  command: "skills [action]",
  describe: "manage and browse arcana skills",
  builder: (yargs) =>
    yargs
      .positional("action", {
        choices: ["list", "info", "search", "ranked"] as const,
        default: "list" as const,
      })
      .option("query", {
        alias: "q",
        type: "string",
        describe: "search query",
      })
      .option("skill", {
        alias: "s",
        type: "string",
        describe: "skill id for info",
      })
      .option("category", {
        alias: "c",
        type: "string",
        describe: "filter by category",
      }),
  async handler(args) {
    const config = await loadConfig()
    const skills = await loadSkills(config.skillsDirs)

    const action = String(args.action ?? "list")

    if (action === "ranked") {
      const db = openMemoryDB(getDataDir(config))
      const mem = new MemoryStore(db)
      const stats = mem.getRecentSkillStats(50)
      const statMap = new Map(stats.map((s) => [s.skillId, s]))
      const ranked = skills
        .map((s) => ({ ...s, stat: statMap.get(s.id) ?? statMap.get(s.name.toLowerCase()) }))
        .filter((s) => s.stat)
        .sort((a, b) => (b.stat!.recent || b.stat!.total) - (a.stat!.recent || a.stat!.total))
      if (!ranked.length) { console.log("No skill usage data yet. Activate skills to build rankings."); return }
      console.log(`${ranked.length} ranked skills (by recent usage):\n`)
      for (const s of ranked.slice(0, 20)) {
        console.log(`  ${s.id.padEnd(36)} ${String(s.stat?.recent ?? 0).padEnd(4)} recent  ${s.description}`)
      }
      return
    }

    if (action === "info") {
      if (!args.skill) {
        console.error("--skill required for info")
        process.exit(1)
      }
      const skill = skills.find((s) => s.id === String(args.skill) || s.name.toLowerCase().includes(String(args.skill).toLowerCase()))
      if (!skill) {
        console.error(`Skill not found: ${args.skill}`)
        process.exit(1)
      }
      console.log(`Name:        ${skill.name}`)
      console.log(`ID:          ${skill.id}`)
      console.log(`Category:    ${skill.category}`)
      console.log(`Description: ${skill.description}`)
      const body = await loadSkillBody(skill.id, config.skillsDirs)
      console.log(`\n${body}`)
      return
    }

    const filtered = args.query
      ? skills.filter((s) => s.name.toLowerCase().includes(String(args.query).toLowerCase()) || s.description.toLowerCase().includes(String(args.query).toLowerCase()))
      : skills
    const byCat = new Map<string, typeof filtered>()
    for (const s of filtered) {
      if (args.category && s.category !== args.category) continue
      const bucket = byCat.get(s.category) ?? []
      bucket.push(s)
      byCat.set(s.category, bucket)
    }

    if (byCat.size === 0) {
      console.log("No skills found.")
      return
    }

    for (const [cat, catSkills] of byCat) {
      console.log(`\n${cat}`)
      console.log("─".repeat(cat.length))
      for (const s of catSkills) {
        console.log(`  ${s.id.padEnd(36)} ${s.description}`)
      }
    }
    console.log(`\n${skills.length} skill(s) total`)
  },
}
