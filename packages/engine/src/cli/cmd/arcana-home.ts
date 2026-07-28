import { join } from "node:path"
import { homedir } from "node:os"
import { mkdirSync, existsSync } from "node:fs"

/**
 * Resolves the Arcana home directory (~/.arcana).
 * Respects ARCANA_HOME environment variable.
 * Matches the existing pattern used across the engine
 * (account/license-bind.ts, license.ts, proxy.ts, index.ts, provider.ts).
 */
export function getArcanaHome(): string {
  return process.env.ARCANA_HOME ?? join(homedir(), ".arcana")
}

/**
 * Resolves the data directory for memory DB, job store, etc.
 * Default: ~/.arcana/data
 * Creates the directory if it doesn't exist.
 */
export function getDataDir(): string {
  const dir = join(getArcanaHome(), "data")
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }) } catch {}
  }
  return dir
}
