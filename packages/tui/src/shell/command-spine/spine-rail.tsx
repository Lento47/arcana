import { useTheme } from "../../context/theme"
import { spineRailWidth, spineTone, type SpineKind, type SpineLayout } from "./spine-types"

export function SpineRail(props: {
  layout: SpineLayout
  kind?: SpineKind
  glyph?: string
  color?: unknown
  active?: boolean
}) {
  if (props.kind === "ask" || props.kind === "plan" || props.kind === "ok") return null
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const width = spineRailWidth(props.layout)
  const symbol = props.glyph ?? "│"
  const color =
    props.color
    ?? (props.glyph && props.kind
      ? spineTone(props.kind, t)
      : props.active
        ? t.spineRailActive
        : t.spineRail)

  // Single glyph + trailing space keeps the rail to 2 cells and aligns content.
  const cell = (symbol + " ").slice(0, width).padEnd(width)

  return (
    <box width={width} flexShrink={0}>
      <text fg={color as any}>{cell}</text>
    </box>
  )
}
