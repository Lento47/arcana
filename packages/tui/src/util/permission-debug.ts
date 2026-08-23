import { appendFileSync, statSync, unlinkSync } from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Permission-gate trace sink.
 *
 * Appends JSONL to `%TEMP%/arcana-permission-debug.log` (same durable-file
 * pattern as the daemon log) so a repro self-captures without terminal
 * redirection — stderr dies with scrollback, this file survives. Permission
 * events are rare, so unconditional appends are negligible; the file is
 * recreated once it passes 1 MB to stay bounded.
 *
 * `ARCANA_DEBUG_PERMISSION=1` additionally mirrors each line to stderr for
 * live debugging. Writes are skipped under `bun test` to keep suites clean.
 */
const LOG_PATH = path.join(os.tmpdir(), "arcana-permission-debug.log")
const MAX_BYTES = 1_000_000

export function logPermissionDebug(message: string, data: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test") return
  const line = `[${new Date().toISOString()}] ${message} ${JSON.stringify(data)}\n`
  try {
    try {
      if (statSync(LOG_PATH).size > MAX_BYTES) unlinkSync(LOG_PATH)
    } catch {
      // missing file — appendFileSync creates it
    }
    appendFileSync(LOG_PATH, line)
  } catch {
    // never let tracing break the TUI
  }
  if (process.env.ARCANA_DEBUG_PERMISSION === "1") {
    console.error(`[permission-debug] ${message} ${JSON.stringify(data)}`)
  }
}

export * as PermissionDebug from "./permission-debug"
