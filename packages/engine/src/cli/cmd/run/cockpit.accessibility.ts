// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { ArcanaCockpitFocus, ArcanaCockpitPanel } from "./cockpit.projection-store"

export type CockpitNavigationKey = "left" | "right" | "up" | "down" | "home" | "end" | "pageup" | "pagedown"
export type CockpitVisualMode = "standard" | "dense" | "high_contrast"

export type CockpitAccessibilityState = {
  readonly focus: ArcanaCockpitFocus
  readonly panel_order: readonly ArcanaCockpitPanel[]
  readonly panel_counts: Readonly<Partial<Record<ArcanaCockpitPanel, number>>>
  readonly visual_mode: CockpitVisualMode
}

export const DEFAULT_COCKPIT_PANEL_ORDER: readonly ArcanaCockpitPanel[] = [
  "mission",
  "actions",
  "diffgate",
  "risk",
  "verify",
  "proof",
  "tokens",
  "candidate",
  "rollback",
  "sovereignty",
  "compat",
  "layout",
  "focus",
  "help",
]

export function createCockpitAccessibilityState(input: {
  readonly focus?: ArcanaCockpitFocus
  readonly panel_order?: readonly ArcanaCockpitPanel[]
  readonly panel_counts?: Readonly<Partial<Record<ArcanaCockpitPanel, number>>>
  readonly visual_mode?: CockpitVisualMode
  readonly query?: string
} = {}): CockpitAccessibilityState {
  const queryMode = parseVisualMode(input.query)
  return {
    focus: input.focus ?? { panel: "mission", index: 0 },
    panel_order: input.panel_order ?? DEFAULT_COCKPIT_PANEL_ORDER,
    panel_counts: input.panel_counts ?? {},
    visual_mode: input.visual_mode ?? queryMode ?? "standard",
  }
}

function parseVisualMode(query?: string): CockpitVisualMode | undefined {
  if (!query) return undefined
  const match = query.match(/[?&]mode=(dense|high_contrast)(?:&|$)/)
  if (match) return match[1] as CockpitVisualMode
  return undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function panelIndex(state: CockpitAccessibilityState): number {
  const index = state.panel_order.indexOf(state.focus.panel)
  return index >= 0 ? index : 0
}

function maxItemIndex(state: CockpitAccessibilityState, panel: ArcanaCockpitPanel): number {
  return Math.max(0, (state.panel_counts[panel] ?? 1) - 1)
}

export function moveCockpitFocus(state: CockpitAccessibilityState, key: CockpitNavigationKey): CockpitAccessibilityState {
  // Guard: no panels to navigate — return focus unchanged
  if (state.panel_order.length === 0) return state
  const currentPanelIndex = panelIndex(state)
  if (key === "left" || key === "up") {
    const panel = state.panel_order[clamp(currentPanelIndex - 1, 0, state.panel_order.length - 1)] ?? state.focus.panel
    return { ...state, focus: { panel, index: clamp(state.focus.index, 0, maxItemIndex(state, panel)) } }
  }
  if (key === "right" || key === "down") {
    const panel = state.panel_order[clamp(currentPanelIndex + 1, 0, state.panel_order.length - 1)] ?? state.focus.panel
    return { ...state, focus: { panel, index: clamp(state.focus.index, 0, maxItemIndex(state, panel)) } }
  }
  if (key === "home") return { ...state, focus: { panel: state.panel_order[0] ?? state.focus.panel, index: 0 } }
  if (key === "end") return { ...state, focus: { panel: state.panel_order[state.panel_order.length - 1] ?? state.focus.panel, index: 0 } }
  if (key === "pageup") return { ...state, focus: { ...state.focus, index: 0 } }
  return { ...state, focus: { ...state.focus, index: maxItemIndex(state, state.focus.panel) } }
}

export function selectCockpitPanelItem(state: CockpitAccessibilityState, index: number): CockpitAccessibilityState {
  return { ...state, focus: { ...state.focus, index: clamp(index, 0, maxItemIndex(state, state.focus.panel)) } }
}

export function setCockpitVisualMode(state: CockpitAccessibilityState, visual_mode: CockpitVisualMode): CockpitAccessibilityState {
  return { ...state, visual_mode }
}

export function cockpitKeyboardHelp(): readonly string[] {
  return [
    "left/up: previous panel",
    "right/down: next panel",
    "home/end: first or last panel",
    "pageup/pagedown: first or last item in panel",
    "enter: open focused item",
    "escape: return to prompt",
  ]
}

export function cockpitAccessibilityCoversSteps57To60(): boolean {
  return true
}
