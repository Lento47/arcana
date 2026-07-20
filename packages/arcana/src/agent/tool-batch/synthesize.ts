/**
 * Parent synthesis — inject focused batch results into the model context (Phase 3).
 * Full worker dumps stay in BatchRunReport.items; parent only sees capped lines.
 */
import type { BatchResult, ClassifiedCall, ToolCapability } from "./types.js"

export function formatBatchWavePlan(waves: ClassifiedCall[][]): string {
  if (!waves.length) return "wave 0 · empty"
  return waves
    .map((wave, index) => {
      const counts = new Map<ToolCapability, number>()
      for (const item of wave) {
        counts.set(item.capability, (counts.get(item.capability) ?? 0) + 1)
      }
      const caps = [...counts.entries()]
        .map(([cap, n]) => `${n} ${cap}`)
        .join(" ")
      return `wave ${index + 1} · ${caps || `${wave.length} call`}`
    })
    .join(" · ")
}

export function truncateOutput(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) return text
  if (maxChars <= 1) return "…"
  return text.slice(0, maxChars - 1) + "…"
}

/**
 * Build the parent-facing batch message: counts + per-call capped lines.
 */
export function synthesizeBatchResult(
  results: BatchResult[],
  opts: {
    maxPerCallChars: number
    maxSynthesisChars: number
    planSummary?: string
  },
): string {
  const ok = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok && r.status !== "cancelled").length
  const cancelled = results.filter((r) => r.status === "cancelled").length

  const headerParts = [`Batch ${ok} ok`]
  if (failed) headerParts.push(`${failed} failed`)
  if (cancelled) headerParts.push(`${cancelled} cancelled`)
  headerParts.push(`${results.length} calls`)
  if (opts.planSummary) headerParts.push(opts.planSummary)

  const lines = [headerParts.join(" · ")]
  for (const r of results) {
    const mark = r.status === "cancelled" ? "·" : r.ok ? "✓" : "✗"
    const body = truncateOutput(r.output.replace(/\s+/g, " ").trim(), opts.maxPerCallChars)
    const dur = r.durationMs !== undefined ? ` (${r.durationMs}ms)` : ""
    lines.push(`${mark} ${r.name}${dur}: ${body}`)
  }

  let out = lines.join("\n")
  if (out.length > opts.maxSynthesisChars) {
    out = truncateOutput(out, opts.maxSynthesisChars - 24) + "\n…(batch synthesis truncated)"
  }
  return out
}
