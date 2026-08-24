import { existsSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

export * as ToolBreaker from "./tool-breaker"

/**
 * Tool-failure circuit breaker (runtime self-heal).
 *
 * A systemic runtime failure (poisoned import binding, corrupted store,
 * broken migration) used to surface as every tool dying with the identical
 * error while the daemon kept running — the operator saw a silent wedge.
 *
 * Rule: when >= THRESHOLD_TOOLS DISTINCT tools fail with the SAME error
 * signature inside WINDOW_MS, trip. Distinct-tools (not raw count) keeps one
 * flaky tool from tripping; same-signature keeps unrelated noise apart.
 *
 * Tripping is side-effect-free; the caller decides what "degraded" means
 * (publish an operator error, hard-restart the process, ...).
 */

export type BreakerDecision = {
  trip: boolean
  signature?: string
  distinctTools?: number
}

const WINDOW_MS = 60_000
const THRESHOLD_TOOLS = 3

let log: Array<{ sig: string; tool: string; at: number }> = []

/** Test hook: clear internal state between cases. */
export function resetToolBreaker(): void {
  log = []
}

function signature(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return raw.split("\n")[0]!.slice(0, 160)
}

export function recordToolFailure(
  tool: string,
  error: unknown,
  now: number = Date.now(),
): BreakerDecision {
  const sig = signature(error)
  log = log.filter((entry) => now - entry.at <= WINDOW_MS)
  log.push({ sig, tool, at: now })
  const matching = log.filter((entry) => entry.sig === sig)
  const tools = new Set(matching.map((entry) => entry.tool))
  if (tools.size >= THRESHOLD_TOOLS) {
    log = []
    return { trip: true, signature: sig, distinctTools: tools.size }
  }
  return { trip: false }
}

// ── Hard-restart guard ────────────────────────────────────────────────
// Tripping means we hard-exit so the supervisor/TUI respawns a fresh
// process. This marker prevents a tight crash loop when the failure is in
// code that a restart cannot fix: within MIN_RESTART_GAP_MS of a previous
// trip, stay degraded and loud instead of exiting again.

const GUARD_FILE = path.join(os.tmpdir(), "arcana-tool-breaker-last-trip")
const MIN_RESTART_GAP_MS = 30_000

export function shouldHardRestart(now: number = Date.now()): boolean {
  try {
    if (existsSync(GUARD_FILE)) {
      const last = Number(readFileSync(GUARD_FILE, "utf8").trim())
      if (Number.isFinite(last) && now - last < MIN_RESTART_GAP_MS) return false
    }
    writeFileSync(GUARD_FILE, String(now))
    return true
  } catch {
    // Unwritable tmp: prefer restarting over staying wedged.
    return true
  }
}
