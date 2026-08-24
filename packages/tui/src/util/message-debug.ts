import { appendFileSync, statSync, unlinkSync } from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Message-delivery trace sink.
 *
 * Appends JSONL to `%TEMP%/arcana-message-debug.log` (same durable-file
 * pattern as the daemon + permission traces) so submit→echo→HTTP→SSE→ack
 * latency can be attributed after the fact without terminal redirection.
 * Probes are rare (per send/echo/SSE-user-event), so unconditional appends
 * are negligible; the file is recreated past 1 MB to stay bounded.
 *
 * `ARCANA_DEBUG_MESSAGE=1` additionally mirrors each line to stderr.
 * Writes are skipped under `bun test`.
 */
const LOG_PATH = path.join(os.tmpdir(), "arcana-message-debug.log")
const MAX_BYTES = 1_000_000

export function logMessageDebug(message: string, data: Record<string, unknown>): void {
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
  if (process.env.ARCANA_DEBUG_MESSAGE === "1") {
    console.error(`[message-debug] ${message} ${JSON.stringify(data)}`)
  }
}

export * as MessageDebug from "./message-debug"
