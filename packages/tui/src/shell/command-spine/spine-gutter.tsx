import { spineGutterWidth, type SpineLayout } from "./spine-types"

/**
 * Left meta column for the command spine.
 * Index only — duration rides the node header so content owns width.
 * Wall-clock is not shown here (details / expand can surface it later).
 */
export function SpineGutter(props: {
  index: number
  layout: SpineLayout
  active?: boolean
}) {
  const width = props.layout === "minimal" ? 0 : spineGutterWidth(props.layout)
  if (width === 0) return null
  return <box width={width} flexShrink={0} />
}
