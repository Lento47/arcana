// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { blockingShims, compatShimRegistry } from "./compat"
import type { ArcanaMigrationPhaseID } from "./migration"

export type ArcanaCompatObservation = {
  readonly shim_id: string
  readonly count: number
  readonly last_seen_at?: string
}

export type ArcanaCompatMetric = ArcanaCompatObservation & {
  readonly blocking: boolean
}

export type ArcanaCompatHealth = {
  readonly total_shims: number
  readonly active_shims: number
  readonly observed_hits: number
  readonly blocking_shims: number
  readonly ready_for_contraction: boolean
}

export function compatMetrics(input: {
  readonly target_phase: ArcanaMigrationPhaseID
  readonly phases: ReadonlyArray<{ id: string }>
  readonly observations?: readonly ArcanaCompatObservation[]
}): ArcanaCompatMetric[] {
  const blockers = new Set(blockingShims(input.target_phase, input.phases).map((shim) => shim.id))
  const observations = new Map((input.observations ?? []).map((item) => [item.shim_id, item]))

  return compatShimRegistry().map((shim) => {
    const observed = observations.get(shim.id)
    return {
      shim_id: shim.id,
      count: observed?.count ?? 0,
      last_seen_at: observed?.last_seen_at,
      blocking: blockers.has(shim.id),
    }
  })
}

export function compatHealth(metrics: readonly ArcanaCompatMetric[]): ArcanaCompatHealth {
  const registry = compatShimRegistry()
  const observed_hits = metrics.reduce((total, metric) => total + metric.count, 0)
  const blocking_shims = metrics.filter((metric) => metric.blocking).length

  return {
    total_shims: registry.length,
    active_shims: registry.filter((shim) => shim.status === "active").length,
    observed_hits,
    blocking_shims,
    ready_for_contraction: blocking_shims === 0 && observed_hits === 0,
  }
}
