// Shared models.dev cache — unified with opencode's ModelsDev service.
// Both arcana CLI and opencode TUI read/write ~/.cache/arcana/models-dev.json.
// Eliminates the split-brain: no duplicate fetch, no stale cache divergence.
//
// The bridge config warmer (bridge.ts) pre-populates this cache on first launch
// so the TUI never blocks on a 10s network timeout.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"

const MODELS_DEV_URL = "https://models.dev/api.json"
const TTL_MS = 30 * 60 * 1000 // 30min — matches opencode's TTL
const FETCH_TIMEOUT_MS = 10000

export type ModelsDevModel = {
  id?: string
  name?: string
  family?: string
}

export type ModelsDevProvider = {
  api?: string
  name?: string
  env?: string[]
  id?: string
  npm?: string
  models?: Record<string, ModelsDevModel>
}

let cache: Record<string, ModelsDevProvider> | null = null

/** Unified cache path — same as opencode's ModelsDev (Global.Path.cache). */
function cachePath(): string {
  return join(homedir(), ".cache", "arcana", "models-dev.json")
}

function readCache(maxAgeMs?: number): Record<string, ModelsDevProvider> | null {
  try {
    const p = cachePath()
    if (!existsSync(p)) return null
    if (maxAgeMs !== undefined) {
      const age = Date.now() - statSync(p).mtimeMs
      if (age > maxAgeMs) return null
    }
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, ModelsDevProvider>
  } catch {
    return null
  }
}

function writeCache(data: Record<string, ModelsDevProvider>): void {
  try {
    const p = cachePath()
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(data))
  } catch { /* best-effort */ }
}

export async function fetchModelsDev(): Promise<Record<string, ModelsDevProvider>> {
  if (cache) return cache

  const fresh = readCache(TTL_MS)
  if (fresh) { cache = fresh; return fresh }

  try {
    const res = await fetch(MODELS_DEV_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as Record<string, ModelsDevProvider>
    writeCache(data)
    cache = data
    return data
  } catch (e) {
    const stale = readCache()
    if (stale) { cache = stale; return stale }
    throw new Error(`Failed to fetch models.dev and no cache: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export function _clearCache(): void { cache = null }
