// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { ArcanaCockpitShell } from "./cockpit.shell"

function fit(text: string, width: number): string {
  if (text.length <= width) return text
  if (width <= 1) return ""
  return `${text.slice(0, width - 1)}…`
}

export function cockpitMissionLine(shell: ArcanaCockpitShell, width = 100): string {
  const mission = shell.areas.find((area) => area.id === "mission-header")
  return fit(`ARCANA MISSION │ ${shell.objective || "unset"} │ ${mission?.metric ?? "no metric"}`, width)
}

export function cockpitShellText(shell: ArcanaCockpitShell, width = 100): string[] {
  const lines = [cockpitMissionLine(shell, width)]
  for (const area of shell.areas.filter((item) => item.id !== "mission-header")) {
    lines.push(fit(`${area.title} │ ${area.summary} │ ${area.metric}`, width))
  }
  return lines
}

export function cockpitShellFingerprint(shell: ArcanaCockpitShell): string {
  return shell.areas.map((area) => `${area.step}:${area.id}`).join("|")
}
