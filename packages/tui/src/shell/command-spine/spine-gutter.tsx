import { useTheme } from "../../context/theme"
import { spineGutterWidth, type SpineLayout } from "./spine-types"

/**
 * Step-index label for the gutter cell (audit S2).
 * Hidden rows (index <= 0) render a blank spacer so the rail never drifts.
 * Real monotonic display indices: the width grows with the session length
 * (spineGutterDigits), so a 100+ row session never repeats "99".
 */
export function gutterStepLabel(index: number, width = 2): string {
  const cellWidth = Math.max(2, width)
  if (index <= 0) return " ".repeat(cellWidth)
  return String(Math.floor(index)).padStart(cellWidth, "0")
}

/**
 * Left meta column for the command spine.
 * Step index only — duration rides the node header so content owns width.
 * Wall-clock is not shown here (details / expand can surface it later).
 */
export function SpineGutter(props: {
  index: number
  layout: SpineLayout
  active?: boolean
  /** Session-global gutter width (defaults to the 2-col contract). */
  gutterWidth?: number
}) {
  const { theme } = useTheme()
  const width = props.layout === "minimal" ? 0 : (props.gutterWidth ?? spineGutterWidth(props.layout))
  if (width === 0) return null
  return (
    <box width={width} flexShrink={0}>
      <text fg={props.active ? theme.accent : theme.textMuted}>{gutterStepLabel(props.index, width)}</text>
    </box>
  )
}
