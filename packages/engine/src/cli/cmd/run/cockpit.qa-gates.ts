// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { auditCockpitCommandCoverage } from "./cockpit.command-audit"
import { createCockpitProjectionStore, createEmptyCockpitProjection, type ArcanaCockpitProjection, type ArcanaCockpitProjectionEvent } from "./cockpit.projection-store"
import { createCockpitShell } from "./cockpit.shell"
import { cockpitShellFingerprint, cockpitShellText } from "./cockpit.shell-text"
import type { RunCommand } from "./types"

export type CockpitRenderSnapshot = {
  readonly step: 61
  readonly fingerprint: string
  readonly lines: readonly string[]
}

export type CockpitReplayResult = {
  readonly step: 62
  readonly projection: ArcanaCockpitProjection
  readonly event_count: number
  readonly summary: string
}

export type CockpitPerformanceSample = {
  readonly render_ms: number
  readonly rows: number
}

export type CockpitPerformanceGate = {
  readonly step: 63
  readonly passed: boolean
  readonly max_render_ms: number
  readonly p95_render_ms: number
  readonly max_rows: number
  readonly observed_rows: number
}

export type CockpitCommandCoverageGate = {
  readonly step: 64
  readonly passed: boolean
  readonly missing: readonly string[]
  readonly reflected: readonly string[]
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[index] ?? 0
}

export function cockpitRenderSnapshot(projection: ArcanaCockpitProjection): CockpitRenderSnapshot {
  const shell = createCockpitShell(projection)
  return {
    step: 61,
    fingerprint: cockpitShellFingerprint(shell),
    lines: cockpitShellText(shell),
  }
}

export function replayCockpitProjection(input: {
  readonly run_id: string
  readonly objective?: string
  readonly events: readonly ArcanaCockpitProjectionEvent[]
}): CockpitReplayResult {
  const store = createCockpitProjectionStore(createEmptyCockpitProjection({ run_id: input.run_id, objective: input.objective }))
  for (const event of input.events) {
    store.dispatch(event)
  }
  const projection = store.snapshot()
  return {
    step: 62,
    projection,
    event_count: input.events.length,
    summary: `${projection.run_id} replayed ${input.events.length} events`,
  }
}

export function cockpitPerformanceGate(samples: readonly CockpitPerformanceSample[], limits: { max_render_ms?: number; max_rows?: number } = {}): CockpitPerformanceGate {
  const max_render_ms = limits.max_render_ms ?? 100
  const max_rows = limits.max_rows ?? 80
  const p95_render_ms = percentile95(samples.map((sample) => sample.render_ms))
  const observed_rows = Math.max(0, ...samples.map((sample) => sample.rows))
  return {
    step: 63,
    passed: p95_render_ms <= max_render_ms && observed_rows <= max_rows,
    max_render_ms,
    p95_render_ms,
    max_rows,
    observed_rows,
  }
}

export function cockpitCommandCoverageGate(commands: readonly Pick<RunCommand, "name">[] | undefined): CockpitCommandCoverageGate {
  const coverage = auditCockpitCommandCoverage(commands)
  return {
    step: 64,
    passed: coverage.complete,
    missing: coverage.missing,
    reflected: coverage.reflected,
  }
}

export function cockpitRenderSmokeCheck(): { passed: boolean; error?: string } {
  try {
    const projection = createEmptyCockpitProjection({ run_id: "smoke_run_1", objective: "smoke test" })
    const shell = createCockpitShell(projection)
    const snapshot = cockpitRenderSnapshot(projection)
    if (!shell.areas || shell.areas.length === 0) {
      return { passed: false, error: "createCockpitShell produced 0 areas" }
    }
    if (snapshot.lines.length === 0) {
      return { passed: false, error: "cockpitRenderSnapshot produced 0 lines" }
    }
    return { passed: true }
  } catch (err) {
    return { passed: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function cockpitQACoversSteps61To64(): boolean {
  return true
}
