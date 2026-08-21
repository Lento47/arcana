import { COMPACT_NOW_PERCENT, COMPACT_SOON_PERCENT } from "../../util/context-pressure"
import type { StatusSegment, StatusTone } from "./spine-types"
import type { StatusSegmentKey } from "../../config"

/**
 * Data available to the command-spine header (audit S3).
 * Every field is optional — the header degrades gracefully to just the brand
 * row when nothing is available (fresh session, no git repo, no usage yet).
 */
export type SpineSegmentSource = {
  sessionID?: string
  branch?: string
  model?: string
  /** Context-token usage percent (0-100) of the active model's limit. */
  ctxPercent?: number | null
  /** Turn state from sessionStatus — "idle" is omitted as noise. */
  state?: string
  /** Working directory — shown on the header path line in wide/compact. */
  path?: string
  /** Self-driven loop: "2/6", "on", "paused", "done". */
  drive?: string | null
}

/**
 * Build real StatusSegment[] for SpineHeader from sync/derived data (S3).
 * Tones align with the app-wide context-pressure thresholds
 * (util/context-pressure, engine `threshold_percent` defaults):
 *   ctx >= 95 → error ("compact now"), >= 85 → warning ("compact soon"), else info.
 * "idle" is turn-state noise — omitted; busy/retry/error surface the turn.
 */
export function buildStatusSegments(src: SpineSegmentSource): StatusSegment[] {
  const segments: StatusSegment[] = []
  if (src.branch) {
    segments.push({ key: "branch", label: "branch", value: src.branch, tone: "accent" })
  }
  if (src.model) {
    segments.push({ key: "model", label: "model", value: src.model, tone: "brand" })
  }
  if (src.ctxPercent != null && Number.isFinite(src.ctxPercent)) {
    const tone: StatusTone =
      src.ctxPercent >= COMPACT_NOW_PERCENT
        ? "error"
        : src.ctxPercent >= COMPACT_SOON_PERCENT
          ? "warning"
          : "info"
    segments.push({ key: "ctx", label: "ctx", value: `${src.ctxPercent}%`, tone })
  }
  if (src.state && src.state !== "idle") {
    const tone: StatusTone = src.state === "error" ? "error" : src.state === "retry" ? "warning" : "info"
    segments.push({ key: "state", label: "state", value: src.state, tone })
  }
  if (src.drive) {
    const tone: StatusTone =
      src.drive === "paused" ? "warning" : src.drive === "done" ? "success" : "info"
    segments.push({ key: "drive", label: "drive", value: src.drive, tone })
  }
  if (src.sessionID) {
    segments.push({ key: "session", label: "session", value: src.sessionID, tone: "muted" })
  }
  if (src.path) {
    segments.push({ key: "path", label: "path", value: src.path, tone: "muted" })
  }
  return segments
}

/**
 * Apply a user-configured segment pick list: return only the picked keys in
 * the user's order, dropping anything that has no segment available.
 * Returns undefined when the pick list is empty so callers keep auto behavior.
 */
export function applyConfiguredSegments(
  segments: StatusSegment[],
  picked: readonly StatusSegmentKey[] | undefined,
): StatusSegment[] | undefined {
  if (!picked || picked.length === 0) return undefined
  const byKey = new Map(segments.map((segment) => [segment.key, segment]))
  const ordered: StatusSegment[] = []
  for (const key of picked) {
    const segment = byKey.get(key)
    if (segment) ordered.push(segment)
  }
  return ordered
}
