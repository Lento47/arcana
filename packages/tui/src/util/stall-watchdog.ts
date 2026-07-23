/**
 * Opt-in main-thread stall detector for long-session freezes.
 *
 * Enable: ARCANA_DEBUG_STALL_MS=200  (interval between ticks; min 50)
 * Disable: unset, empty, 0, or "false"
 *
 * When the JS event loop is blocked, setInterval gaps stretch. We log those
 * gaps so freezes (metrics + scroll dead) can be correlated with store size /
 * last SSE event / compaction — without changing production behavior when off.
 */

export type StallSnapshot = {
  sessionID?: string
  msgCount?: number
  /** Approximate UTF-16 code units of text/tool output retained for the session. */
  partApproxBytes?: number
  compacting?: boolean
  lastEventType?: string
  lastEventAgeMs?: number
  routeType?: string
}

export type StallWatchdogOptions = {
  /** Tick interval in ms (from ARCANA_DEBUG_STALL_MS). */
  intervalMs: number
  /**
   * Cheap snapshot on every tick is optional; prefer returning only light fields
   * here and computing heavy fields only when `onStall` fires (see getHeavySnapshot).
   */
  getSnapshot?: () => StallSnapshot
  /** Called only when a stall is reported — may do heavier work. */
  getHeavySnapshot?: () => StallSnapshot
  /** Override log sink (tests). Default: console.error */
  log?: (line: string) => void
  /** Minimum gap (ms) to report. Default: max(500, intervalMs * 2.5) */
  warnGapMs?: number
}

/** Parse env; returns undefined when watchdog should stay off. */
export function parseStallIntervalMs(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): number | undefined {
  const raw = env.ARCANA_DEBUG_STALL_MS
  if (raw === undefined || raw === "" || raw === "0" || raw.toLowerCase() === "false") return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 50) return undefined
  return Math.floor(n)
}

export function formatStallLine(gapMs: number, snap: StallSnapshot, extra?: { heapUsedMB?: number }): string {
  const parts = [
    `[stall] gapMs=${Math.round(gapMs)}`,
    `sessionID=${snap.sessionID ?? "-"}`,
    `msgCount=${snap.msgCount ?? "-"}`,
    `partApproxBytes=${snap.partApproxBytes ?? "-"}`,
    `compacting=${snap.compacting === undefined ? "-" : snap.compacting ? "1" : "0"}`,
    `lastEventType=${snap.lastEventType ?? "-"}`,
    `lastEventAgeMs=${snap.lastEventAgeMs ?? "-"}`,
    `routeType=${snap.routeType ?? "-"}`,
  ]
  if (extra?.heapUsedMB !== undefined) parts.push(`heapUsedMB=${extra.heapUsedMB.toFixed(1)}`)
  return parts.join(" ")
}

/**
 * Start the watchdog. Returns a stop function (clearInterval).
 * No-op when intervalMs is invalid (caller should gate with parseStallIntervalMs).
 */
export function startStallWatchdog(options: StallWatchdogOptions): () => void {
  const intervalMs = options.intervalMs
  if (!Number.isFinite(intervalMs) || intervalMs < 50) return () => {}

  const warnGapMs = options.warnGapMs ?? Math.max(500, intervalMs * 2.5)
  const log = options.log ?? ((line: string) => console.error(line))
  let last = performance.now()

  const id = setInterval(() => {
    const now = performance.now()
    const gap = now - last
    last = now
    if (gap < warnGapMs) return

    const light = options.getSnapshot?.() ?? {}
    const heavy = options.getHeavySnapshot?.() ?? {}
    const snap: StallSnapshot = { ...light, ...heavy }

    let heapUsedMB: number | undefined
    try {
      const mem = typeof process !== "undefined" ? process.memoryUsage?.() : undefined
      if (mem && typeof mem.heapUsed === "number") heapUsedMB = mem.heapUsed / (1024 * 1024)
    } catch {
      // ignore
    }

    log(formatStallLine(gap, snap, { heapUsedMB }))
  }, intervalMs)

  return () => clearInterval(id)
}
