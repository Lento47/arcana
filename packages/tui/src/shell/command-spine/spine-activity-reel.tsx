import { MouseButton, type MouseEvent, type RGBA } from "@opentui/core"
import { createMemo, createSignal } from "solid-js"
import { tint, useTheme } from "../../context/theme"
import { Alpha } from "../../theme/emphasis"
import { COPY, Glyph } from "../../branding"
import { compactSpineElapsed, formatElapsedMs, spineElapsedMax, type SpineLayout } from "./spine-types"
import type { ActivityEntry } from "./spine-entry-view"
import { displayWidth, truncate } from "../../util/locale"
import { createFlare } from "../../util/motion"
import { useSpineMotion } from "./spine-motion"
import { SpineRail } from "./spine-rail"
import { activityStepGist } from "./spine-activity"

function elapsedLabel(props: { view: ActivityEntry; layout: SpineLayout; phase: number }): string {
  void props.phase
  const start = props.view.startMs
  const raw = props.view.streaming && typeof start === "number" && Number.isFinite(start)
    ? formatElapsedMs(Math.max(0, Date.now() - start))
    : props.view.elapsed
  // Same budget the node header truncates to: the two rows show the same
  // duration for the same work, so a retuned budget must move both or the reel
  // clips where the node header does not.
  return compactSpineElapsed(raw, spineElapsedMax(props.layout))
}

/**
 * One-line work summary. It deliberately owns no navigation state:
 * children remain the immutable projected entries used for expansion/copy,
 * and the normal spine navigation moves to the next chronological turn.
 */
export function ActivityReel(props: {
  view: ActivityEntry
  layout: SpineLayout
  expanded: boolean
  focused?: boolean
  contentWidth?: number
  onToggle: () => void
}) {
  const { theme } = useTheme()
  const motion = useSpineMotion()
  // Header row is clickable (collapse/expand). Hover feedback mirrors the
  // entry header and session rail: interactive states must be visible.
  const [hovered, setHovered] = createSignal(false)
  // Settle flare: the card lifts for a beat when the live work lands.
  const settleFlare = createFlare(() => props.view.streaming !== true)
  const flareInk = (base: RGBA) => {
    const intensity = settleFlare()
    return intensity > 0 ? tint(base, theme.text, intensity * Alpha.lift) : base
  }

  // The shared tick only invalidates the live duration. It must never choose
  // a different child or otherwise animate the activity summary.
  const phase = createMemo(() => motion?.phase() ?? 0)
  const elapsed = createMemo(() => elapsedLabel({ view: props.view, layout: props.layout, phase: phase() }))
  // Settled cards say what they did; a live card stays calm while steps land.
  // The gist is capped so a long shell command cannot dominate the line.
  const gist = createMemo(() =>
    props.view.streaming === true ? "" : truncate(activityStepGist(props.view.children ?? []), 44),
  )
  // One source for the status word: the row paints it and also measures it to
  // budget the summary beside it. A second literal for the same state would
  // let an edit to the painted word silently mis-truncate every reel.
  const statusLabel = createMemo(() =>
    props.view.streaming === true ? COPY.activity.live : COPY.activity.settled,
  )
  const activityWidth = createMemo(() => {
    const width = typeof props.contentWidth === "number" && Number.isFinite(props.contentWidth)
      ? Math.floor(props.contentWidth)
      : 80
    return Math.max(20, width)
  })
  const activityText = createMemo(() => {
    const width = activityWidth()
    // The summary already owns the step count; the chevron is the affordance,
    // not a second count ("hide 2 steps" beside "2 actions" was the noise).
    const hint = props.expanded ? Glyph.chevronOpen : Glyph.chevronClosed
    const tailParts = [
      width >= 52 ? elapsed() : "",
    ].filter(Boolean)
    const tail = tailParts.join(" · ")
    const prefixWidth = displayWidth(`${statusLabel()} · `)
    const tailWidth = tail ? displayWidth(` · ${tail}`) + displayWidth(` ${hint}`) : displayWidth(` ${hint}`)
    const summaryBudget = Math.max(1, width - prefixWidth - tailWidth)
    const detail =
      gist() && gist() !== props.view.summary ? `${props.view.summary} · ${gist()}` : props.view.summary
    return {
      summary: truncate(detail, summaryBudget),
      tail,
      hint,
    }
  })

  const toggleFromHeader = (event: MouseEvent) => {
    if (event.button !== undefined && event.button !== MouseButton.LEFT) return
    event.stopPropagation?.()
    event.preventDefault?.()
    props.onToggle()
  }

  return (
    <box
      flexDirection="row"
      flexShrink={0}
      minWidth={0}
      onMouseUp={toggleFromHeader}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      backgroundColor={hovered() ? theme.backgroundElement : undefined}
    >
      {/* The reel's mark is decided once, in the model (spine-activity.ts sets
          it on build and rebuild); re-deriving it here from `streaming` gave
          the row two answers to one question. */}
      <SpineRail
        layout={props.layout}
        glyph={props.view.glyph}
        active={props.focused}
      />
      <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} overflow="hidden">
        <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} overflow="hidden">
          <text wrapMode="none">
            <span style={{ fg: props.view.streaming === true ? theme.accent : flareInk(theme.spineOk) }}>
              {statusLabel()}
            </span>
            <span style={{ fg: theme.spineDiffMuted }}> · </span>
            <span style={{ fg: theme.text }}>{activityText().summary}</span>
            <span style={{ fg: theme.spineDiffMuted }}>{activityText().tail ? ` · ${activityText().tail}` : ""}</span>
            <span style={{ fg: theme.spineDiffMuted }}>{` ${activityText().hint}`}</span>
          </text>
        </box>
      </box>
    </box>
  )
}
