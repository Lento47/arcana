import { appendFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Durable daemon lifecycle log. Crash/stop handlers write to stderr, which
 * vanishes with the process in dev mode (terminal scrollback or a closed
 * console). This file survives, so a daemon death can be correlated with the
 * lock timeline and the SSE drop the TUI observed.
 */
export const DAEMON_LOG = path.join(os.tmpdir(), "arcana-daemon.log")

export function daemonLog(line: string): void {
  try {
    appendFileSync(DAEMON_LOG, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    /* never let logging take the process down */
  }
}
