import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { sparkline, SparkMax, type SparkSummary } from "./sparkline"

/**
 * One row of block-glyph history. The newest sample sits at the right edge,
 * so a fixed-width sparkline reads as time flowing rightwards.
 */
export function Sparkline(props: {
  values: readonly number[]
  /** Cells; defaults to one per sample so nothing is padded or dropped. */
  width?: number
  summary?: SparkSummary
  fg?: RGBA
  bg?: RGBA
}) {
  const { theme } = useTheme()
  const text = () => sparkline(props.values, props.width ?? props.values.length, props.summary ?? SparkMax)
  return (
    <text fg={props.fg ?? theme.spineContext} bg={props.bg} wrapMode="none">
      {text()}
    </text>
  )
}
