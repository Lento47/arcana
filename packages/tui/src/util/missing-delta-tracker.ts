/**
 * Missing-part delta diagnostics (P12.5).
 *
 * When a message.part.delta arrives for a part the store does not know (its
 * creation event was dropped, reordered, or the part array is absent), the
 * delta is NEVER replayed: replay against a full part risks text duplication.
 * Instead we record bounded diagnostics and trigger an authoritative
 * reconcile, which restores the part from REST. This module keeps the
 * accounting; the sync provider wires the trigger.
 */
export type MissingDeltaStats = {
  count: number
  bytes: number
  firstAt: number
  lastAt: number
  lastSequence: number
}

export const MISSING_DELTA_MAX_PER_PART = 128
export const MISSING_DELTA_MAX_BYTES = 256 * 1024
export const MISSING_DELTA_TTL_MS = 15_000
const MAX_TRACKED_PARTS = 64

export function createMissingDeltaTracker() {
  const stats = new Map<string, MissingDeltaStats>()

  function note(partID: string, delta: string | undefined, sequence: number | undefined): MissingDeltaStats {
    const now = Date.now()
    const current = stats.get(partID) ?? { count: 0, bytes: 0, firstAt: now, lastAt: 0, lastSequence: 0 }
    current.count += 1
    current.bytes += (delta ?? "").length
    current.lastAt = now
    current.lastSequence = sequence ?? 0
    stats.set(partID, current)
    if (stats.size > MAX_TRACKED_PARTS) {
      const cutoff = now - MISSING_DELTA_TTL_MS
      for (const [id, s] of stats) {
        if (s.lastAt < cutoff) stats.delete(id)
      }
    }
    return current
  }

  /** True when the part's pending delta log exceeded its bounds (resets the log). */
  function overflowed(partID: string): boolean {
    const s = stats.get(partID)
    if (!s) return false
    if (s.count >= MISSING_DELTA_MAX_PER_PART || s.bytes >= MISSING_DELTA_MAX_BYTES) {
      stats.delete(partID)
      return true
    }
    return false
  }

  function clear(partID: string) {
    stats.delete(partID)
  }

  function snapshot() {
    return new Map(stats)
  }

  return { note, overflowed, clear, snapshot }
}

export type MissingDeltaTracker = ReturnType<typeof createMissingDeltaTracker>
