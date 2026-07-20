/**
 * Lightweight multi-tool turn report for engine admission (Phase 3 projection).
 * Mirrors into @arcana/core tool activity hint for TUI proof tape.
 */
import { getToolActivityHint } from "@arcana/core/tool/activity-hint"
import { classifyToolName, type ToolCapability } from "./classify"

export type EngineBatchSnapshot = {
  active: number
  maxActive: number
  byCapability: Partial<Record<ToolCapability, number>>
  lastPlanSummary?: string
}

let lastPlanSummary: string | undefined

export function formatEngineCapabilityHint(toolNames: string[]): string {
  const counts = new Map<ToolCapability, number>()
  for (const name of toolNames) {
    const cap = classifyToolName(name)
    counts.set(cap, (counts.get(cap) ?? 0) + 1)
  }
  const parts = [...counts.entries()].map(([cap, n]) => `${n} ${cap}`)
  lastPlanSummary = parts.length ? `tools · ${parts.join(" · ")}` : undefined
  return lastPlanSummary ?? "tools"
}

/** Prefer live core hint (same process as TUI); fall back to last formatted summary. */
export function lastEngineBatchHint(): string | undefined {
  return getToolActivityHint() ?? lastPlanSummary
}

export function engineBatchSnapshot(
  stats: { active: number; maxActive: number },
): EngineBatchSnapshot {
  return {
    active: stats.active,
    maxActive: stats.maxActive,
    byCapability: {},
    lastPlanSummary: lastEngineBatchHint(),
  }
}
