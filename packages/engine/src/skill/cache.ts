/**
 * File-based skill cache — skips glob + YAML parsing (2-4s) on warm starts.
 * Cache key = hash of directory mtimes. On cache hit, returns stored skills
 * directly. On miss, rescans and updates cache.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync, statSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { createHash } from "node:crypto"

const CACHE_PATH = join(homedir(), ".cache", "arcana", "skills-cache.json")

type CacheEntry = {
  key: string
  skills: Record<string, { name: string; description?: string; location: string; content: string }>
  dirs: string[]
  ts: number
}

function dirsKey(dirs: string[]): string {
  const hash = createHash("sha256")
  for (const dir of [...dirs].sort()) {
    try {
      const stat = statSync(dir)
      hash.update(`${dir}:${stat.mtimeMs}`)
    } catch {
      hash.update(`${dir}:missing`)
    }
  }
  return hash.digest("hex").slice(0, 16)
}

export async function readCache(dirs: string[]): Promise<CacheEntry | null> {
  if (!existsSync(CACHE_PATH)) return null
  try {
    const raw = await readFile(CACHE_PATH, "utf8")
    const entry = JSON.parse(raw) as CacheEntry
    if (entry.key === dirsKey(dirs)) return entry
  } catch {
    // corrupted cache — ignore
  }
  return null
}

export async function writeCache(
  dirs: string[],
  skills: Record<string, { name: string; description?: string; location: string; content: string }>,
  skillDirs: string[],
): Promise<void> {
  const entry: CacheEntry = {
    key: dirsKey(dirs),
    skills,
    dirs: skillDirs,
    ts: Date.now(),
  }
  await mkdir(dirname(CACHE_PATH), { recursive: true })
  await writeFile(CACHE_PATH, JSON.stringify(entry), "utf8")
}
