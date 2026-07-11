import type { JSX } from "@opentui/solid"
import {
  spineGutterWidth,
  spineOuterPadding,
  spineRailWidth,
  type SpineLayout,
} from "./spine-types"
import { SpineRail } from "./spine-rail"
import type { SpineKind } from "./spine-types"

/**
 * Shared left chrome for entries, prompt, and gates.
 * Keeps gutter + rail columns identical so bottom chrome never drifts.
 *
 * Layout:
 *   [outer pad][gutter width][rail width][ content… ]
 */
export function spineLeadMetrics(layout: SpineLayout) {
  return {
    pad: spineOuterPadding(layout),
    gutter: spineGutterWidth(layout),
    rail: spineRailWidth(layout),
  }
}

/** Empty gutter spacer (prompt / gate rows that don't show step numbers). */
export function SpineGutterSpacer(props: { layout: SpineLayout }) {
  return <box width={spineGutterWidth(props.layout)} flexShrink={0} />
}

/**
 * Leading columns for a content row that continues the spine.
 * Parent should set `paddingLeft={metrics.pad}` on the outer row.
 */
export function SpineLeadColumns(props: {
  layout: SpineLayout
  /** When set, renders a kind glyph; otherwise continuity rail `│`. */
  kind?: SpineKind
  glyph?: string
  color?: unknown
  active?: boolean
  /** Optional gutter cell content (step index). Empty spacer if omitted. */
  gutter?: JSX.Element
}) {
  return (
    <>
      {props.gutter ?? <SpineGutterSpacer layout={props.layout} />}
      <SpineRail
        layout={props.layout}
        kind={props.kind}
        glyph={props.glyph}
        color={props.color}
        active={props.active}
      />
    </>
  )
}

/** Total left offset before content text (pad + gutter + rail). Useful for diagnostics. */
export function spineContentOffset(layout: SpineLayout) {
  const m = spineLeadMetrics(layout)
  return m.pad + m.gutter + m.rail
}
