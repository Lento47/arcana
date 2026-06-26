// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { ArcanaCockpitProjection } from "./cockpit.projection-store"

export type CockpitTokenConsoleView = {
  readonly id: "token-console"
  readonly step: 41
  readonly title: "Token Console"
  readonly pressure: "calm" | "attention" | "danger" | "blocked"
  readonly budget_decision: string
  readonly reconciliation: string
  readonly estimate: string
  readonly actual: string
  readonly rows: readonly string[]
  readonly empty: boolean
}

function formatTokens(value: number | undefined): string {
  return value === undefined || Number.isNaN(value) ? "unknown" : `${value} tokens`
}

function formatCost(value: number | undefined): string {
  return value === undefined || Number.isNaN(value) ? "unknown" : `${value}µ`
}

export function tokenConsoleView(projection: ArcanaCockpitProjection): CockpitTokenConsoleView {
  const admission = projection.tokens?.admission
  const reconciliation = projection.tokens?.reconciliation
  const pressure = projection.tokens?.pressure ?? "calm"
  const ctx = projection.tokens
  const rows = [
    `pressure ${pressure}`,
    `decision ${admission?.decision ?? "none"}`,
    `estimate ${formatTokens(admission?.estimated_tokens)} / ${formatCost(admission?.estimated_cost_micros)}`,
    `remaining ${formatTokens(admission?.remaining_tokens)} / ${formatCost(admission?.remaining_cost_micros)}`,
    `reconcile ${reconciliation?.status ?? "missing"}`,
    `actual ${formatTokens(reconciliation?.actual_total)}`,
    `delta ${formatTokens(reconciliation?.delta)}`,
    ...(ctx?.context_estimated_tokens
      ? [
          `context ${formatTokens(ctx.context_estimated_tokens)} / ${formatTokens(ctx.context_budget_tokens)} budget · ${ctx.context_message_count ?? "?"} msgs`,
          `  system ${formatTokens(ctx.context_system_tokens)} · tool ${formatTokens(ctx.context_tool_tokens)}`,
        ]
      : []),
  ]

  return {
    id: "token-console",
    step: 41,
    title: "Token Console",
    pressure,
    budget_decision: admission?.decision ?? "none",
    reconciliation: reconciliation?.status ?? "missing",
    estimate: formatTokens(admission?.estimated_tokens),
    actual: formatTokens(reconciliation?.actual_total),
    rows,
    empty: !projection.tokens,
  }
}

export function tokenConsoleIsActionable(view: CockpitTokenConsoleView): boolean {
  return view.pressure !== "calm" || view.reconciliation === "missing_estimate" || view.reconciliation === "over_estimate"
}
