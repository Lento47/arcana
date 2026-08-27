/** @jsxImportSource @opentui/solid */
import type { RGBA } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import { formatMetricsBorder } from "./metrics"

/** Rounded lower frame edge that owns its width and cannot wrap metrics. */
export function PromptMetricsBorder(props: {
  frameWidth: () => number
  metrics: () => string
  color: RGBA
}): JSX.Element {
  const line = () => formatMetricsBorder(props.metrics(), props.frameWidth())
  return (
    <box width="100%" flexDirection="row" flexShrink={0}>
      <text wrapMode="none" fg={props.color}>{line()}</text>
    </box>
  )
}
