import {
  spineGutterWidth,
  spineOuterPadding,
  spineRailWidth,
  type SpineLayout,
} from "./spine-types"

/**
 * Shared left chrome for entries, prompt, and gates.
 * Keeps gutter + rail columns identical so bottom chrome never drifts.
 *
 * Layout:
 *   [outer pad][gutter width][rail width][ content… ]
 */
export function spineLeadMetrics(layout: SpineLayout, gutterWidth?: number) {
  return {
    pad: spineOuterPadding(layout),
    gutter: gutterWidth ?? spineGutterWidth(layout),
    rail: spineRailWidth(layout),
  }
}

/** Empty gutter spacer (prompt / gate rows that don't show step numbers). */
export function SpineGutterSpacer(props: { layout: SpineLayout; width?: number }) {
  return <box width={props.width ?? spineGutterWidth(props.layout)} flexShrink={0} />
}
