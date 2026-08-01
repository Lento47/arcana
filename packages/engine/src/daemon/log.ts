import { appendFileSync } from "node:fs"

/**
 * Durable daemon lifecycle log. Crash/stop handlers write to stderr, which
 * vanishes with the process in dev mode (terminal scrollback or a closed
 * console). This file survives, so a daemon death can be correlated with the
 * lock timeline and the SSE drop the TUI observed.
 * Windows path precedent: src/session/prompt.ts writes L:/tmp/arcana-ollama.log.
 */
export const DAEMON_LOG = "L:/tmp/arcana-daemon.log"

export function daemonLog(line: string): void {
  try {
    appendFileSync(DAEMON_LOG, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    /* never let logging take the process down */
  }
}
