import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { Locale } from "../../util/locale"
import { gaugeParts } from "./gauge"

/**
 * Progress with an optional ETA. Built for work that outlives a toast: model
 * downloads, updates, indexing, compaction. The percentage always renders, so
 * a narrow terminal clips the label first and the truth last.
 */
export function Progress(props: {
  ratio: number
  width?: number
  label?: string
  /** Remaining time in ms; omitted or non-finite renders no ETA segment. */
  etaMs?: number
  fill?: RGBA
  track?: RGBA
}) {
  const { theme } = useTheme()
  const parts = () => gaugeParts(props.ratio, props.width ?? 20)
  const percent = () => `${Math.round(Math.max(0, Math.min(1, Number.isFinite(props.ratio) ? props.ratio : 0)) * 100)}%`
  const eta = () => {
    const ms = props.etaMs
    if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return ""
    const remaining = Locale.duration(ms)
    return remaining ? ` · eta ${remaining}` : ""
  }
  return (
    <text wrapMode="none">
      <span style={{ fg: props.fill ?? theme.spineOk }}>{parts().fill}</span>
      <span style={{ fg: props.track ?? theme.borderSubtle }}>{parts().track}</span>
      {props.label ? <span style={{ fg: theme.spineContext }}>{` ${props.label}`}</span> : null}
      <span style={{ fg: theme.spineContext }}>{` ${percent()}${eta()}`}</span>
    </text>
  )
}
