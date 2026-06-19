import { readdir, readFile, stat } from "node:fs/promises"
import { join, basename, dirname, relative } from "node:path"
import matter from "gray-matter"
import type { Skill, SkillMeta } from "./types.js"

async function* walkSkillDirs(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) yield* walkSkillDirs(full)
    else if (e.name === "SKILL.md") yield full
  }
}

async function parseSkillFile(path: string, skillsRoot: string): Promise<Skill | null> {
  try {
    const raw = await readFile(path, "utf8")
    const parsed = matter(raw)
    const meta = parsed.data as Partial<SkillMeta>
    if (!meta.name || !meta.description) return null

    const relDir = dirname(relative(skillsRoot, path))
    const parts = relDir.split(/[\\/]/)
    const category = parts[0] ?? "misc"
    const id = meta.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")

    return {
      id,
      meta: {
        name: meta.name,
        description: meta.description,
        version: meta.version ?? "1.0.0",
        author: meta.author,
        license: meta.license,
        platforms: meta.platforms,
        metadata: meta.metadata,
      },
      body: parsed.content.trim(),
      path,
      category,
    }
  } catch {
    return null
  }
}

export class SkillRegistry {
  private skills = new Map<string, Skill>()
  private loaded = false

  constructor(private readonly skillsDirs: string[]) {}

  async load(): Promise<void> {
    this.skills.clear()
    for (const dir of this.skillsDirs) {
      try {
        await stat(dir)
      } catch {
        continue
      }
      for await (const path of walkSkillDirs(dir)) {
        const skill = await parseSkillFile(path, dir)
        if (skill && !this.skills.has(skill.id)) {
          this.skills.set(skill.id, skill)
        }
      }
    }
    this.loaded = true
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id)
  }

  list(): Skill[] {
    return [...this.skills.values()]
  }

  byCategory(): Map<string, Skill[]> {
    const out = new Map<string, Skill[]>()
    for (const skill of this.skills.values()) {
      const bucket = out.get(skill.category) ?? []
      bucket.push(skill)
      out.set(skill.category, bucket)
    }
    return out
  }

  search(query: string): Skill[] {
    if (!query) return this.list()
    const q = query.toLowerCase()
    return this.list().filter(
      (s) =>
        s.id.includes(q) ||
        s.meta.name.toLowerCase().includes(q) ||
        s.meta.description.toLowerCase().includes(q) ||
        s.meta.metadata?.arcana?.tags?.some((t) => t.includes(q)) ||
        s.meta.metadata?.hermes?.tags?.some((t) => t.includes(q)),
    )
  }

  isLoaded(): boolean {
    return this.loaded
  }
}
