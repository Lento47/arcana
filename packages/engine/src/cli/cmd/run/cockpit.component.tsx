/** @jsxImportSource @opentui/solid */
// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { TextAttributes } from "@opentui/core"
import { For, createMemo, type Accessor } from "solid-js"
import type { ArcanaCockpitShell } from "./cockpit.shell"
import { CockpitAreaCard } from "./cockpit.area-card"
import type { RunFooterTheme } from "./theme"

export type ArcanaCockpitComponentMode = "cockpit" | "focus" | "dense"

export function cockpitVisibleAreas(shell: ArcanaCockpitShell, mode: ArcanaCockpitComponentMode = shell.mode) {
  const areas = shell.areas.filter((area) => area.id !== "mission-header")
  if (mode === "focus") {
    return areas.filter((area) => area.panel === shell.focus)
  }
  return areas
}

export function ArcanaCockpit(props: {
  shell: ArcanaCockpitShell
  theme: Accessor<RunFooterTheme>
  mode?: ArcanaCockpitComponentMode
}) {
  const mode = createMemo(() => props.mode ?? props.shell.mode)
  const mission = createMemo(() => props.shell.areas.find((area) => area.id === "mission-header"))
  const areas = createMemo(() => cockpitVisibleAreas(props.shell, mode()))

  return (
    <box width="100%" flexDirection="column" gap={0} backgroundColor="transparent">
      <box
        width="100%"
        height={2}
        flexDirection="column"
        border={["left"]}
        borderColor={props.theme().highlight}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={props.theme().surface}
      >
        <text fg={props.theme().highlight} attributes={TextAttributes.BOLD} wrapMode="none" truncate>
          ARCANA MISSION
        </text>
        <text fg={props.theme().text} wrapMode="none" truncate>
          {props.shell.objective || mission()?.summary || "No active objective"}
          <span style={{ fg: props.theme().muted }}> · {mission()?.metric ?? "no proof state"}</span>
        </text>
      </box>

      <For each={areas()}>
        {(area) => (
          <CockpitAreaCard
            area={area}
            theme={props.theme}
            focused={area.panel === props.shell.focus}
          />
        )}
      </For>
    </box>
  )
}
