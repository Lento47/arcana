/**
 * Unified skill loader — reads from opencode's shared skills-cache.json.
 * Eliminates the split-brain: arcana CLI and opencode TUI now share one skill cache.
 * Falls back to direct filesystem scan if cache is stale/missing.
 */
import { readFile, readdir } from "node:fs/promises"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join, basename, dirname, relative } from "node:path"
import { homedir } from "node:os"
import { createHash } from "node:crypto"
import matter from "gray-matter"

export type SkillInfo = {
  name: string
  description: string
  body: string
  id: string
  category: string
}

const CACHE_PATH = join(homedir(), ".cache", "arcana", "skills-cache.json")

function dirsKey(dirs: string[]): string {
  const hash = createHash("sha256")
  for (const d of [...dirs].sort()) {
    try { hash.update(`${d}:${statSync(d).mtimeMs}`) } catch { hash.update(`${d}:missing`) }
  }
  return hash.digest("hex").slice(0, 16)
}

async function scanDir(dir: string): Promise<SkillInfo[]> {
  const results: SkillInfo[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      results.push(...await scanDir(full))
    } else if (e.name === "SKILL.md") {
      try {
        const raw = await readFile(full, "utf8")
        const parsed = matter(raw)
        const meta = parsed.data as { name?: string; description?: string }
        if (meta.name) {
          const relDir = relative(dir, dirname(full))
          const category = relDir.split(/[\\/]/)[0] ?? "misc"
          results.push({
            name: meta.name,
            description: meta.description ?? "",
            body: parsed.content.trim(),
            id: meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            category,
          })
        }
      } catch { /* skip bad files */ }
    }
  }
  return results
}

export async function loadSkills(skillDirs: string[]): Promise<SkillInfo[]> {
  const validDirs = skillDirs.filter((d) => existsSync(d))
  if (!validDirs.length) return []

  // Try shared opencode cache first
  const key = dirsKey(validDirs)
  if (existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE_PATH, "utf8"))
      if (cached.key === key && cached.skills) {
        const result: SkillInfo[] = []
        for (const [id, info] of Object.entries(cached.skills as Record<string, any>)) {
          result.push({
            name: info.name,
            description: info.description ?? "",
            body: info.content ?? "",
            id,
            category: info.location ? dirname(info.location).split(/[\\/]/).pop() ?? "misc" : "misc",
          })
        }
        return result
      }
    } catch { /* cache stale/corrupt — scan directly */ }
  }

  // Fallback: scan filesystem (slow on cold start, rare)
  const results: SkillInfo[] = []
  for (const dir of validDirs) {
    results.push(...await scanDir(dir))
  }
  return results
}
