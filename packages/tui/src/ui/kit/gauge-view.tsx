import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { gaugeParts } from "./gauge"

/**
 * A proportional bar with the fill and the track inked separately. The label
 * and percentage live outside the bar so a clipped bar can never hide the
 * value it represents.
 */
export function Gauge(props: {
  ratio: number
  width: number
  /** Inked with the fill; keep it short. */
  label?: string
  /** Show the percentage after the bar (default true). */
  showPercent?: boolean
  fill?: RGBA
  track?: RGBA
}) {
  const { theme } = useTheme()
  const parts = () => gaugeParts(props.ratio, props.width)
  const percent = () => `${Math.round(Math.max(0, Math.min(1, Number.isFinite(props.ratio) ? props.ratio : 0)) * 100)}%`
  return (
    <text wrapMode="none">
      <span style={{ fg: props.fill ?? theme.spineOk }}>{parts().fill}</span>
      <span style={{ fg: props.track ?? theme.borderSubtle }}>{parts().track}</span>
      {props.label ? <span style={{ fg: theme.spineContext }}>{` ${props.label}`}</span> : null}
      {props.showPercent !== false ? <span style={{ fg: theme.spineContext }}>{` ${percent()}`}</span> : null}
    </text>
  )
}
