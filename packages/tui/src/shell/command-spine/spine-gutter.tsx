import { useTheme } from "../../context/theme"
import { spineGutterWidth, type SpineLayout } from "./spine-types"

/**
 * Left meta column for the command spine.
 *
 * Index only — duration rides the node header so content owns width.
 * Wall-clock is not shown here (details / expand can surface it later).
 */
export function SpineGutter(props: {
  index: number
  layout: SpineLayout
  active?: boolean
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const width = spineGutterWidth(props.layout)
  const indexColor = () => (props.active ? t.text : t.textMuted) as any
  // 01..99; fall back to raw digits if index ≥ 100 (rare).
  const padded =
    props.index >= 0 && props.index < 100
      ? props.index.toString().padStart(2, "0")
      : String(props.index)

  return (
    <box width={width} flexShrink={0}>
      <text fg={indexColor()}>{padded.slice(0, width).padEnd(width)}</text>
    </box>
  )
}
