import { useTheme } from "../../context/theme"
import { spineElapsedMax, spineGutterWidth, type SpineLayout } from "./spine-types"

function compactElapsed(elapsed: string, max: number): string {
  if (!elapsed || max <= 0) return ""
  const value = elapsed.trim()
  if (!value) return ""
  if (value.length <= max) return value
  // Prefer dropping the "+" and sub-second detail over overflowing the gutter.
  const stripped = value.replace(/^\+/, "").replace(/(\d+)\.(\d+)s/, "$1s")
  if (stripped.length <= max) return `+${stripped}`.slice(0, max)
  return value.slice(0, max - 1) + "…"
}

function compactTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return ""
  // Accept "HH:MM:SS" or "HH:MM" — always show HH:MM to save 3 cols.
  const match = timestamp.match(/^(\d{1,2}:\d{2})(?::\d{2})?/)
  return match?.[1] ?? timestamp.slice(0, 5)
}

/**
 * Left meta column for the command spine.
 *
 * Design goal: step identity without eating the chat column.
 * Single row:  `01 +1.2s`  (or `01 12:41` when elapsed is empty and time is available).
 * Never a two-line block.
 */
export function SpineGutter(props: {
  index: number
  elapsed: string
  timestamp?: string
  layout: SpineLayout
  active?: boolean
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const width = spineGutterWidth(props.layout)
  const indexColor = () => (props.active ? t.text : t.textMuted) as any
  const metaColor = () => (props.active ? t.text : t.spineGutterElapsed) as any
  const padded = props.index.toString().padStart(2, "0")

  if (props.layout === "minimal") {
    return (
      <box width={width} flexShrink={0}>
        <text fg={indexColor()}>{padded}</text>
      </box>
    )
  }

  const maxElapsed = spineElapsedMax(props.layout)
  const elapsed = compactElapsed(props.elapsed, maxElapsed)
  // Prefer duration (narrative) over wall-clock; fall back to HH:MM only when needed.
  const meta = elapsed || compactTimestamp(props.timestamp)
  // "01" + " " + meta, right-padded to fixed gutter width for rail alignment.
  const line = meta ? `${padded} ${meta}` : padded
  const display = line.length > width ? line.slice(0, width - 1) + "…" : line.padEnd(width)

  return (
    <box width={width} flexShrink={0}>
      <text>
        <span style={{ fg: indexColor() }}>{display.slice(0, 2)}</span>
        <span style={{ fg: metaColor() }}>{display.slice(2)}</span>
      </text>
    </box>
  )
}
