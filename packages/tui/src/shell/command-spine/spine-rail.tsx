import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { spineRailCell, spineRailWidth, spineTone, type SpineKind, type SpineLayout } from "./spine-types"

export function SpineRail(props: {
  layout: SpineLayout
  kind?: SpineKind
  glyph?: string
  color?: RGBA
  active?: boolean
}) {
  if (props.kind === "ask" || props.kind === "plan" || props.kind === "ok") return null
  const { theme } = useTheme()
  const width = spineRailWidth(props.layout)
  const symbol = props.glyph ?? "│"
  const color =
    props.color
    ?? (props.glyph && props.kind
      ? spineTone(props.kind, theme)
      : props.active
        ? theme.spineRailActive
        : theme.spineRail)

  // B8: display-width, grapheme-safe cell — 1-col glyph + trailing space;
  // a 2-col glyph (◤, ⤷) fills the 2-col rail alone, never split mid-pair.
  const cell = spineRailCell(symbol, width)

  return (
    <box width={width} flexShrink={0}>
      <text fg={color}>{cell}</text>
    </box>
  )
}
