// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { providerProfile } from "@/kernel"
import type { ArcanaCockpitProjection } from "./cockpit.projection-store"

export type CockpitRuntimeMeterID =
  | "token-burn"
  | "cache-hit-ratio"
  | "context-pressure"
  | "provider-route"
  | "provider-state"
  | "compat-blockers"
  | "perf-budget"

export type CockpitRuntimeMeter = {
  readonly id: CockpitRuntimeMeterID
  readonly step: 51 | 52 | 53 | 54 | 55 | 56
  readonly label: string
  readonly value: string
  readonly severity: "calm" | "attention" | "danger" | "blocked"
  readonly reason: string
}

export function perfBudgetMeter(p95: number, threshold: number): CockpitRuntimeMeter {
  const withinBudget = p95 <= threshold
  return {
    id: "perf-budget",
    step: 56,
    label: "Perf Budget",
    value: withinBudget ? `p95 ${p95}ms ≤ ${threshold}ms` : `p95 ${p95}ms > ${threshold}ms`,
    severity: withinBudget ? "calm" : p95 > threshold * 2 ? "danger" : "attention",
    reason: withinBudget
      ? "p95 within budget"
      : `p95 exceeds threshold by ${Math.round(p95 - threshold)}ms`,
  }
}

export type CockpitRuntimeMeterInput = {
  readonly provider?: string
  readonly cache_read_tokens?: number
  readonly cache_write_tokens?: number
  readonly uncached_input_tokens?: number
  readonly context_tokens?: number
  readonly context_budget_tokens?: number
  readonly compaction_active?: boolean
  readonly opaque_provider_state_ref?: string
}

function percent(value: number): string {
  if (!Number.isFinite(value)) return "0%"
  return `${Math.round(value * 100)}%`
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return 0
  return Math.max(0, Math.min(1, numerator / denominator))
}

function pressureForRatio(value: number): CockpitRuntimeMeter["severity"] {
  if (value >= 1) return "blocked"
  if (value >= 0.9) return "danger"
  if (value >= 0.75) return "attention"
  return "calm"
}

export function tokenBurnMeter(projection: ArcanaCockpitProjection): CockpitRuntimeMeter {
  const reconciliation = projection.tokens?.reconciliation
  const admission = projection.tokens?.admission
  const estimate = reconciliation?.estimated_total ?? admission?.estimated_tokens
  const actual = reconciliation?.actual_total
  const delta = reconciliation?.delta
  return {
    id: "token-burn",
    step: 51,
    label: "Estimated vs actual token burn",
    value: `${estimate ?? "unknown"} estimated / ${actual ?? "unknown"} actual`,
    severity: projection.tokens?.pressure ?? "calm",
    reason: delta === undefined ? "No token reconciliation has been recorded." : `Actual token delta is ${delta}.`,
  }
}

export function cacheHitRatioMeter(input: CockpitRuntimeMeterInput = {}): CockpitRuntimeMeter {
  const read = input.cache_read_tokens ?? 0
  const write = input.cache_write_tokens ?? 0
  const uncached = input.uncached_input_tokens ?? 0
  const total = read + write + uncached
  const hitRatio = ratio(read, total)
  return {
    id: "cache-hit-ratio",
    step: 52,
    label: "Cache hit ratio",
    value: read === 0 ? "N/A" : percent(hitRatio),
    severity: total === 0 ? "attention" : hitRatio < 0.1 ? "attention" : "calm",
    reason: total === 0 ? "No cache-classified input tokens are available." : `${read} cache-read tokens out of ${total} input tokens.`,
  }
}

export function contextPressureMeter(input: CockpitRuntimeMeterInput = {}): CockpitRuntimeMeter {
  const used = input.context_tokens ?? 0
  const budget = input.context_budget_tokens ?? 0
  const value = ratio(used, budget)
  const severity = input.compaction_active ? "attention" : pressureForRatio(value)
  return {
    id: "context-pressure",
    step: 53,
    label: "Context pressure / compaction",
    value: budget > 0 ? `${used}/${budget} · ${percent(value)}` : "unknown",
    severity,
    reason: input.compaction_active ? "Context compaction is active." : budget > 0 ? "Context usage is within known budget." : "No context budget is available.",
  }
}

export function providerRouteMeter(projection: ArcanaCockpitProjection, input: CockpitRuntimeMeterInput = {}): CockpitRuntimeMeter {
  const providerName = input.provider ?? [...projection.actions].reverse().find((action) => action.kind === "provider" || action.kind === "model")?.name
  const provider = providerName ? providerProfile(providerName) : undefined
  const route = !provider ? "unknown" : provider.region === "local" ? "local" : provider.region === "self_hosted" ? "self-hosted" : provider.gateway ? "gateway" : "direct"
  return {
    id: "provider-route",
    step: 54,
    label: "Provider route / region / local-cloud mode",
    value: provider ? `${provider.provider} · ${provider.region} · ${route}` : "unknown",
    severity: provider ? "calm" : "attention",
    reason: provider ? `Usage style ${provider.usage_style}.` : "Provider route is not known to Arcana.",
  }
}

export function providerStateMeter(input: CockpitRuntimeMeterInput = {}): CockpitRuntimeMeter {
  return {
    id: "provider-state",
    step: 55,
    label: "Opaque provider-state indicator",
    value: input.opaque_provider_state_ref ? "present" : "none",
    severity: input.opaque_provider_state_ref ? "attention" : "calm",
    reason: input.opaque_provider_state_ref
      ? `Opaque provider state is referenced by ${input.opaque_provider_state_ref}.`
      : "No opaque provider state is carried into cockpit state.",
  }
}

export function compatBlockerMeter(projection: ArcanaCockpitProjection): CockpitRuntimeMeter {
  const compat = projection.compat
  const blockers = compat?.blocking_shims ?? 0
  return {
    id: "compat-blockers",
    step: 56,
    label: "Compat shim blocker meter",
    value: compat ? `${blockers} blocking / ${compat.active_shims} active` : "unknown",
    severity: blockers > 0 ? "attention" : "calm",
    reason: compat ? `Observed hits: ${compat.observed_hits}. Ready for contraction: ${String(compat.ready_for_contraction)}.` : "No compatibility health is available.",
  }
}

export function cockpitRuntimeMeters(projection: ArcanaCockpitProjection, input: CockpitRuntimeMeterInput = {}): readonly CockpitRuntimeMeter[] {
  return [
    tokenBurnMeter(projection),
    cacheHitRatioMeter(input),
    contextPressureMeter(input),
    providerRouteMeter(projection, input),
    providerStateMeter(input),
    compatBlockerMeter(projection),
  ]
}

export function cockpitRuntimeMetersCoverSteps51To56(meters: readonly CockpitRuntimeMeter[]): boolean {
  const steps = new Set(meters.map((meter) => meter.step))
  return [51, 52, 53, 54, 55, 56].every((step) => steps.has(step as CockpitRuntimeMeter["step"]))
}
