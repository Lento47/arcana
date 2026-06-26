/** @jsxImportSource @opentui/solid */
// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { TextAttributes } from "@opentui/core"
import { createMemo, type Accessor } from "solid-js"
import type { ArcanaCockpitArea } from "./cockpit.shell"
import { cockpitAreaCardView, type ArcanaCockpitAreaTone } from "./cockpit.area-card"
import type { RunFooterTheme } from "./theme"

function toneColor(tone: ArcanaCockpitAreaTone, theme: RunFooterTheme) {
  if (tone === "error") return theme.error
  if (tone === "warning") return theme.warning
  if (tone === "accent") return theme.highlight
  if (tone === "normal") return theme.text
  return theme.muted
}

export function CockpitAreaCard(props: {
  area: ArcanaCockpitArea
  theme: Accessor<RunFooterTheme>
  focused?: boolean
}) {
  const view = createMemo(() => cockpitAreaCardView(props.area))
  const color = createMemo(() => toneColor(view().tone, props.theme()))

  return (
    <box
      width="100%"
      height={3}
      flexDirection="column"
      border={["left"]}
      borderColor={props.focused ? props.theme().selected : color()}
      backgroundColor={props.focused ? props.theme().pane : "transparent"}
      paddingLeft={1}
      paddingRight={1}
    >
      <box width="100%" height={1} flexDirection="row" gap={1} backgroundColor="transparent">
        <text fg={color()} attributes={props.focused ? TextAttributes.BOLD : undefined} wrapMode="none" truncate flexGrow={1}>
          {view().title}
        </text>
        <text fg={props.theme().muted} wrapMode="none" truncate flexShrink={0}>
          {view().metric}
        </text>
      </box>
      <box width="100%" height={1} flexDirection="row" gap={1} backgroundColor="transparent">
        <text fg={color()} wrapMode="none" truncate flexShrink={0}>
          {view().state_label}
        </text>
        <text fg={props.theme().text} wrapMode="none" truncate flexGrow={1}>
          {view().summary}
        </text>
      </box>
    </box>
  )
}
