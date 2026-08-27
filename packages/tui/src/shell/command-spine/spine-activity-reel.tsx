import { MouseButton, type MouseEvent } from "@opentui/core"
import { createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { compactSpineElapsed, formatElapsedMs, type SpineLayout } from "./spine-types"
import type { ActivityEntry } from "./spine-entry-view"
import { displayWidth, truncate } from "../../util/locale"
import { useSpineMotion } from "./spine-motion"
import { SpineRail } from "./spine-rail"

function elapsedLabel(props: { view: ActivityEntry; layout: SpineLayout; phase: number }): string {
  void props.phase
  const start = props.view.startMs
  const raw = props.view.streaming && typeof start === "number" && Number.isFinite(start)
    ? formatElapsedMs(Math.max(0, Date.now() - start))
    : props.view.elapsed
  return compactSpineElapsed(raw, props.layout === "narrow" ? 5 : props.layout === "minimal" ? 0 : 7)
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

  const count = createMemo(() => props.view.children.length)
  // The shared tick only invalidates the live duration. It must never choose
  // a different child or otherwise animate the activity summary.
  const phase = createMemo(() => motion?.phase() ?? 0)
  const elapsed = createMemo(() => elapsedLabel({ view: props.view, layout: props.layout, phase: phase() }))
  const activityWidth = createMemo(() => {
    const width = typeof props.contentWidth === "number" && Number.isFinite(props.contentWidth)
      ? Math.floor(props.contentWidth)
      : 80
    return Math.max(20, width)
  })
  const activityText = createMemo(() => {
    const width = activityWidth()
    const status = props.view.streaming === true ? "working" : "work"
    const hint = width >= 28
      ? `${props.expanded ? "▾ hide" : "▸ show"} ${count()} ${count() === 1 ? "step" : "steps"}`
      : `${props.expanded ? "▾" : "▸"} ${count()}`
    const tailParts = [
      width >= 52 ? elapsed() : "",
      hint,
    ].filter(Boolean)
    const tail = tailParts.join(" · ")
    const prefixWidth = displayWidth(`${status} · `)
    const tailWidth = tail ? displayWidth(` · ${tail}`) : 0
    const summaryBudget = Math.max(1, width - prefixWidth - tailWidth)
    return {
      summary: truncate(props.view.summary, summaryBudget),
      tail,
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
    >
      <SpineRail
        layout={props.layout}
        glyph={props.view.streaming === true ? "●" : "✓"}
        active={props.focused}
      />
      <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} overflow="hidden">
        <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} overflow="hidden">
          <text wrapMode="none">
            <span style={{ fg: props.view.streaming === true ? theme.accent : theme.spineOk }}>
              {props.view.streaming === true ? "working" : "work"}
            </span>
            <span style={{ fg: theme.spineDiffMuted }}> · </span>
            <span style={{ fg: theme.text }}>{activityText().summary}</span>
            <span style={{ fg: theme.spineDiffMuted }}>{activityText().tail ? ` · ${activityText().tail}` : ""}</span>
          </text>
        </box>
      </box>
    </box>
  )
}
