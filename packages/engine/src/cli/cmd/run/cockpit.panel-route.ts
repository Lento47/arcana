// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { ArcanaCockpitFocus, ArcanaCockpitPanel, ArcanaCockpitProjectionEvent } from "./cockpit.projection-store"

export const COCKPIT_PANEL_ROUTES = {
  mission: "mission",
  actions: "actions",
  risk: "risk",
  diffgate: "diffgate",
  verify: "verify",
  proof: "proof",
  tokens: "tokens",
  candidate: "candidate",
  rollback: "rollback",
  sovereignty: "sovereignty",
  compat: "compat",
  layout: "layout",
  focus: "focus",
  help: "help",
} as const satisfies Record<string, ArcanaCockpitPanel>

export type CockpitPanelRouteName = keyof typeof COCKPIT_PANEL_ROUTES

export function normalizeCockpitRouteName(name: string): CockpitPanelRouteName | undefined {
  const normalized = name.trim().replace(/^[:/]+/, "")
  return normalized in COCKPIT_PANEL_ROUTES ? (normalized as CockpitPanelRouteName) : undefined
}

export function cockpitPanelRoute(name: string): ArcanaCockpitPanel | undefined {
  const route = normalizeCockpitRouteName(name)
  return route ? COCKPIT_PANEL_ROUTES[route] : undefined
}

export function cockpitFocusRoute(name: string, index = 0): ArcanaCockpitFocus | undefined {
  const panel = cockpitPanelRoute(name)
  return panel ? { panel, index } : undefined
}

export function cockpitFocusRouteEvent(name: string, index = 0): ArcanaCockpitProjectionEvent | undefined {
  const focus = cockpitFocusRoute(name, index)
  return focus ? { type: "focus", focus } : undefined
}
