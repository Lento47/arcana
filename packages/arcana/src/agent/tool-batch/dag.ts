/**
 * Path-conflict DAG → topological waves (Phase 2).
 * Preserves original order for conflicting pairs (earlier → later edge).
 */
import type { ClassifiedCall } from "./types.js"
import { pathSetsConflict } from "./paths.js"

export type WorkEdge = { from: string; to: string }

/**
 * Build dependsOn edges: later call depends on earlier when path sets conflict.
 */
export function buildPathDependencies(
  items: ClassifiedCall[],
  cwd?: string,
): Map<string, string[]> {
  const dependsOn = new Map<string, string[]>()
  for (const item of items) dependsOn.set(item.id, [])

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const earlier = items[i]!
      const later = items[j]!
      if (pathSetsConflict(earlier, later, cwd)) {
        dependsOn.get(later.id)!.push(earlier.id)
      }
    }
  }
  return dependsOn
}

/**
 * Topological level-order waves within a set of items.
 * Ready set = items whose dependencies are all already completed (not remaining).
 * Cycle / missing edge: force earliest remaining item (model order).
 */
export function planPathWaves(items: ClassifiedCall[], cwd?: string): ClassifiedCall[][] {
  if (items.length <= 1) return items.length ? [items] : []

  const dependsOn = buildPathDependencies(items, cwd)
  const byId = new Map(items.map((item) => [item.id, item]))
  const remaining = new Set(items.map((item) => item.id))
  const waves: ClassifiedCall[][] = []

  while (remaining.size > 0) {
    const readyIds = [...remaining].filter((id) =>
      (dependsOn.get(id) ?? []).every((dep) => !remaining.has(dep)),
    )

    // Cycle break: take first remaining in original order
    const waveIds =
      readyIds.length > 0
        ? readyIds
        : [items.find((item) => remaining.has(item.id))!.id]

    // Preserve original relative order within the wave
    const order = new Map(items.map((item, index) => [item.id, index]))
    waveIds.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))

    const wave = waveIds.map((id) => byId.get(id)!)
    waves.push(wave)
    for (const id of waveIds) remaining.delete(id)
  }

  return waves
}

export function attachDependsOn(
  items: ClassifiedCall[],
  cwd?: string,
): Array<ClassifiedCall & { dependsOn: string[] }> {
  const deps = buildPathDependencies(items, cwd)
  return items.map((item) => ({
    ...item,
    dependsOn: deps.get(item.id) ?? [],
  }))
}
