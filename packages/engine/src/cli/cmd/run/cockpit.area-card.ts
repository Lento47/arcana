// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { ArcanaCockpitArea, ArcanaCockpitShell } from "./cockpit.shell"

export type ArcanaCockpitAreaTone = "muted" | "normal" | "accent" | "warning" | "error"

export type ArcanaCockpitAreaCardView = {
  readonly id: ArcanaCockpitArea["id"]
  readonly title: string
  readonly state: ArcanaCockpitArea["state"]
  readonly state_label: string
  readonly tone: ArcanaCockpitAreaTone
  readonly metric: string
  readonly summary: string
  readonly focusable: boolean
}

export function cockpitAreaTone(area: ArcanaCockpitArea): ArcanaCockpitAreaTone {
  if (area.state === "blocked") return "error"
  if (area.state === "danger") return "error"
  if (area.state === "attention") return "warning"
  if (area.state === "active") return "normal"
  return "muted"
}

export function cockpitAreaStateLabel(area: ArcanaCockpitArea): string {
  if (area.state === "blocked") return "blocked"
  if (area.state === "danger") return "elevated"
  if (area.state === "attention") return "attention"
  if (area.state === "active") return "live"
  return "empty"
}

export function cockpitAreaCardView(area: ArcanaCockpitArea): ArcanaCockpitAreaCardView {
  return {
    id: area.id,
    title: area.title,
    state: area.state,
    state_label: cockpitAreaStateLabel(area),
    tone: cockpitAreaTone(area),
    metric: area.metric,
    summary: area.summary,
    focusable: area.id !== "mission-header",
  }
}

export function cockpitAreaCardViews(shell: ArcanaCockpitShell): readonly ArcanaCockpitAreaCardView[] {
  return shell.areas.map(cockpitAreaCardView)
}

export function cockpitAreaCardLine(view: ArcanaCockpitAreaCardView): string {
  return `${view.title} │ ${view.state_label} │ ${view.metric} │ ${view.summary}`
}
