import type { PromptRef } from "../../component/prompt"
import { Prompt } from "../../component/prompt"
import { PLACEHOLDER } from "../../branding"
import { useTheme } from "../../context/theme"
import { SpineRail } from "./spine-rail"
import { spineRailWidth, type SpineLayout } from "./spine-types"
import { useSpineMotion } from "./spine-motion"

/**
 * S9: composer liveness is signal-driven. `pulseActive` remains the pure
 * lifecycle gate for shared motion consumers; the prompt owns the brand lead
 * while the shared phase supplies its active glyph/color cycle. Waiting is
 * engine-authored for permission / approval gates and remains visually stable
 * while the operator decides.
 */
export type SpinePromptState = "idle" | "working" | "retrying" | "waiting" | "stop"

export function pulseActive(state: SpinePromptState): boolean {
  return state === "working" || state === "retrying"
}

export function SpinePrompt(props: {
  bind: (r: PromptRef | undefined) => void
  disabled: () => boolean
  visible: () => boolean
  sessionID: string
  /** Called after send. May receive the submitted text for optimistic UI. */
  toBottom: (text?: string) => void
  layout: () => SpineLayout
  state: () => SpinePromptState
  /** Width of the session viewport after route-level chrome; the lead rail is deducted here. */
  contentWidth?: number
  /** Session-global gutter width so the composer stays aligned with rows. */
  gutterWidth?: number
}) {
  const { theme } = useTheme()
  const motion = useSpineMotion()
  const promptContentWidth = () => {
    const width = props.contentWidth
    if (typeof width !== "number" || !Number.isFinite(width)) return undefined
    return Math.max(1, Math.floor(width) - spineRailWidth(props.layout()))
  }
  const markerGlyph = () => {
    if (pulseActive(props.state())) {
      const glyphs = [
        "✣", "✭", "⁂", "◎", "○", "✺", "◉", "✢", "✷", "✽", "✦", "✹",
        "⬤", "◒", "✫", "✬", "✩", "◑", "✮", "✥", "⁑", "◌", "∗", "✶",
        "✯", "◍", "✻", "✤", "◓", "✼", "✰", "●", "✪", "✧", "◐", "✸",
      ]
      const phase = motion?.phase() ?? 0
      return glyphs[Math.floor(phase / 2) % glyphs.length] ?? "✶"
    }
    return "✶"
  }
  const markerColor = () => {
    const state = props.state()
    if (state === "stop") return theme.spineFail
    if (state === "waiting") return theme.warning
    if (pulseActive(state)) {
      const pulse = [
        theme.spineRun,
        theme.spinePrompt,
        theme.spineBrand,
        theme.spineInspect,
        theme.accent,
        theme.success,
      ]
      const phase = motion?.phase() ?? 0
      return pulse[Math.floor(phase / 2) % pulse.length] ?? theme.spinePrompt
    }
    return theme.spinePrompt
  }

  // Keep the brand lead outside the rounded frame. This preserves the
  // `✶ ╭…╮` command-spine silhouette while the frame and metrics remain
  // full-width within the session viewport. During active model work the
  // shared spine-motion phase animates the lead; idle and approval states stay
  // stable without allocating a prompt-owned timer.
  return (
    <box flexDirection="column" flexShrink={0} flexGrow={0} width="100%" paddingTop={0} paddingBottom={0}>
      <box flexDirection="row" flexShrink={0} alignItems="flex-start" width="100%">
        <SpineRail layout={props.layout()} glyph={markerGlyph()} color={markerColor()} active />
        <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={0} overflow="visible" position="relative">
          <Prompt
            ref={props.bind}
            disabled={props.disabled()}
            visible={props.visible()}
            onSubmit={props.toBottom}
            sessionID={props.sessionID}
            variant="command-spine"
            contentWidth={promptContentWidth()}
            placeholders={PLACEHOLDER}
          />
        </box>
      </box>
    </box>
  )
}
