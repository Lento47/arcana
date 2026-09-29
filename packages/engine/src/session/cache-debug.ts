import { appendFileSync, statSync, unlinkSync } from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Prompt prefix-cache trace sink.
 *
 * The engine daemon is spawned with stdio ignored, so Effect logs never reach
 * a terminal. Append JSONL to `%TEMP%/arcana-cache-debug.log` (same durable
 * file pattern as the daemon + permission + message traces) so prompt
 * volatility can be attributed after the fact. Enabled by
 * `ARCANA_DEBUG_CACHE=1`; writes are skipped under `bun test`.
 */
const LOG_PATH = path.join(os.tmpdir(), "arcana-cache-debug.log")
const MAX_BYTES = 1_000_000

export function cacheDebugEnabled(): boolean {
  return process.env.ARCANA_DEBUG_CACHE === "1" && process.env.NODE_ENV !== "test"
}

export function logCacheDebug(message: string, data: Record<string, unknown>): void {
  if (!cacheDebugEnabled()) return
  const line = `[${new Date().toISOString()}] ${message} ${JSON.stringify(data)}\n`
  try {
    try {
      if (statSync(LOG_PATH).size > MAX_BYTES) unlinkSync(LOG_PATH)
    } catch {
      // missing file — appendFileSync creates it
    }
    appendFileSync(LOG_PATH, line)
  } catch {
    // never let tracing break the turn
  }
  console.error(`[cache-debug] ${message} ${JSON.stringify(data)}`)
}

export * as CacheDebug from "./cache-debug"
