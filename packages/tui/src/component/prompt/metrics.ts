import type { ContextPressureLabel } from "../../util/context-pressure"
import { Locale } from "../../util/locale"

/**
 * Session metrics used by both the command-spine frame and the standalone
 * metrics bar. These are presentation values; the session/event schemas stay
 * unchanged.
 */
export type SessionMetricSnapshot = {
  elapsedSeconds?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  ttftMs?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /** Fresh (non-cached) share of the last turn's prompt tokens, 0–100. */
  cacheMissPercentTurn?: number
  /** Fresh (non-cached) share of the session's cumulative prompt tokens, 0–100. */
  cacheMissPercentSession?: number
  costUsd?: number
  pressure?: ContextPressureLabel
  freeRemaining?: string
}

type MetricKey =
  | "elapsed"
  | "flow"
  | "total"
  | "cost"
  | "pressure"
  | "ttft"
  | "cacheRead"
  | "cacheWrite"
  | "cacheMiss"
  | "free"

type MetricSegment = {
  key: MetricKey
  text: string
  short?: string
}

export const METRIC_SEPARATOR = "  ·  "
export const METRICS_BORDER_TAIL = "────╯"
export const METRICS_BORDER_OVERHEAD = 1 + METRICS_BORDER_TAIL.length

function positive(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined
}

/** Compact token counts for this chrome surface (`k`/`m`, not global `K`/`M`). */
export function compactMetricCount(value: number | undefined): string | undefined {
  const count = positive(value)
  if (count === undefined) return undefined
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return String(Math.round(count))
}

/** Token buckets needed for cache ratio math (uncached input + read + write = billed input). */
export type CacheTokens = {
  input?: number
  cache?: { read?: number; write?: number }
}

const tokenCount = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0

/**
 * Share of prompt tokens served fresh (not from cache), 0–100. Cache-write
 * tokens are fresh too — they populate the cache but are billed as misses this
 * turn. Returns undefined when no input tokens are known, so cold sessions do
 * not render a meaningless 0%.
 */
export function cacheMissPercent(tokens: CacheTokens | undefined): number | undefined {
  if (!tokens) return undefined
  const uncached = tokenCount(tokens.input)
  const read = tokenCount(tokens.cache?.read)
  const write = tokenCount(tokens.cache?.write)
  const total = uncached + read + write
  if (total <= 0) return undefined
  return Math.round(((uncached + write) / total) * 100)
}

function joinSegments(segments: readonly MetricSegment[]): string {
  return segments.map((segment) => segment.text).join(METRIC_SEPARATOR)
}

function makeSegments(snapshot: SessionMetricSnapshot): MetricSegment[] {
  const segments: MetricSegment[] = []
  const elapsed = positive(snapshot.elapsedSeconds)
  if (elapsed !== undefined) {
    const duration = Locale.duration(elapsed * 1000)
    segments.push({
      key: "elapsed",
      text: `⌬ ${duration}`,
      short: `⌬ ${duration.split(" ")[0] ?? duration}`,
    })
  }

  const input = compactMetricCount(snapshot.inputTokens)
  const output = compactMetricCount(snapshot.outputTokens)
  if (input || output) {
    segments.push({
      key: "flow",
      text: `${input ?? "0"}↓  ${output ?? "0"}↑`,
      short: `${input ?? "0"}↓ ${output ?? "0"}↑`,
    })
  }

  const total = compactMetricCount(snapshot.totalTokens)
  if (total) segments.push({ key: "total", text: `${total} total` })

  const ttft = positive(snapshot.ttftMs)
  if (ttft !== undefined) {
    segments.push({ key: "ttft", text: `${Locale.duration(ttft)} ttft` })
  }

  const cacheRead = compactMetricCount(snapshot.cacheReadTokens)
  if (cacheRead) segments.push({ key: "cacheRead", text: `${cacheRead}↺` })

  const cacheWrite = compactMetricCount(snapshot.cacheWriteTokens)
  if (cacheWrite) segments.push({ key: "cacheWrite", text: `${cacheWrite}↻` })

  const missTurn = snapshot.cacheMissPercentTurn
  const missSession = snapshot.cacheMissPercentSession
  if (missTurn !== undefined || missSession !== undefined) {
    const parts: string[] = []
    if (missTurn !== undefined) parts.push(`${missTurn}% turn`)
    if (missSession !== undefined) parts.push(`${missSession}% sess`)
    segments.push({
      key: "cacheMiss",
      text: `miss ${parts.join(" · ")}`,
      short: missTurn !== undefined ? `miss ${missTurn}%` : `miss ${missSession}%`,
    })
  }

  const cost = typeof snapshot.costUsd === "number" && Number.isFinite(snapshot.costUsd) && snapshot.costUsd > 0
    ? Locale.currency(snapshot.costUsd)
    : undefined
  if (cost) segments.push({ key: "cost", text: cost })

  if (snapshot.pressure) {
    segments.push({
      key: "pressure",
      text: snapshot.pressure,
      short: snapshot.pressure === "compact now" ? "ctx now" : "ctx soon",
    })
  }

  if (snapshot.freeRemaining) {
    segments.push({ key: "free", text: `free ${snapshot.freeRemaining}` })
  }

  return segments
}

const OPTIONAL_DROP_ORDER: readonly MetricKey[] = ["free", "cacheWrite", "cacheRead", "cacheMiss", "ttft", "flow"]

function withoutKey(segments: readonly MetricSegment[], key: MetricKey): MetricSegment[] {
  return segments.filter((segment) => segment.key !== key)
}

/**
 * Format metrics into a single display-width-bounded line. The normal order
 * mirrors the product chrome; when space is constrained, optional details are
 * removed in a deterministic order while elapsed/total/cost/pressure remain.
 */
export function formatSessionMetrics(snapshot: SessionMetricSnapshot, maxWidth = Number.POSITIVE_INFINITY): string {
  const segments = makeSegments(snapshot)
  if (segments.length === 0) return ""

  const budget = Number.isFinite(maxWidth) ? Math.max(0, Math.floor(maxWidth)) : Number.POSITIVE_INFINITY
  if (budget === 0) return ""

  const full = joinSegments(segments)
  if (Locale.displayWidth(full) <= budget) return full

  let selected = segments.slice()
  for (const key of OPTIONAL_DROP_ORDER) {
    selected = withoutKey(selected, key)
    const candidate = joinSegments(selected)
    if (Locale.displayWidth(candidate) <= budget) return candidate
  }

  // Use the short pressure label only after optional details have been
  // removed; safety visibility is retained even at very small widths.
  const compact = selected.map((segment) => segment.short ? { ...segment, text: segment.short } : segment)
  const compactText = joinSegments(compact)
  if (Locale.displayWidth(compactText) <= budget) return compactText

  // The border owns the corners. Truncation here is a final tiny-terminal
  // fallback, never a source of wrapping or a malformed closing corner.
  return Locale.truncate(compactText, budget)
}

/** Build an exact-width rounded lower border around a metrics string. */
export function formatMetricsBorder(metrics: string, frameWidth: number): string {
  const width = Number.isFinite(frameWidth) ? Math.max(1, Math.floor(frameWidth)) : 1
  if (width < 2) return "╰"
  if (width < METRICS_BORDER_OVERHEAD + 1) {
    return `╰${"─".repeat(Math.max(0, width - 2))}╯`
  }

  const metricsBudget = width - METRICS_BORDER_OVERHEAD
  const fitted = metrics ? Locale.truncate(metrics, metricsBudget) : ""
  const fill = Math.max(0, width - 1 - Locale.displayWidth(fitted) - Locale.displayWidth(METRICS_BORDER_TAIL))
  return `╰${"─".repeat(fill)}${fitted}${METRICS_BORDER_TAIL}`
}
