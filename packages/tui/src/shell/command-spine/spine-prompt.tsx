import type { PromptRef } from "../../component/prompt"
import { Prompt } from "../../component/prompt"
import { PLACEHOLDER } from "../../branding"
import { useTheme } from "../../context/theme"
import { type SpineLayout } from "./spine-types"
import { SpineGutterSpacer, spineLeadMetrics } from "./spine-lead"
import { SpineRail } from "./spine-rail"
import { useSpineMotion } from "./spine-motion"

/**
 * S9: the composer marker pulse is signal-driven, so the interval must run
 * only while the session is working and stop in idle/waiting/stop, where markerColor
 * returns a static color and a running timer would be pure render-thread
 * waste. Waiting is engine-authored for permission/approval gates and must
 * remain visually stable while the operator decides.
 */
export type SpinePromptState = "idle" | "working" | "retrying" | "waiting" | "stop"

export function pulseActive(state: SpinePromptState): boolean {
  return state === "working"
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
  /** Session-global gutter width so the composer stays aligned with rows. */
  gutterWidth?: number
}) {
  const { theme } = useTheme()
  const motion = useSpineMotion()
  const layout = () => props.layout()
  const metrics = () => spineLeadMetrics(layout(), props.gutterWidth)
  const markerGlyph = () => {
    if (props.state() === "working" || props.state() === "retrying") {
      const glyphs = ["✣","✭","⁂","◎","○","✺","◉","✢","✷","✽","✦","✹","⬤","◒","✫","✬","✩","◑","✮","✥","⁑","◌","∗","✶","✯","◍","✻","✤","◓","✼","✰","●","✪","✧","◐","✸"]
      const phase = motion?.phase() ?? 0
      return glyphs[Math.floor(phase / 2) % glyphs.length] ?? "✶"
    }
    return "✶"
  }
  const markerColor = () => {
    if (props.state() === "stop") return theme.spineFail
    if (props.state() === "waiting") return theme.warning
    if (props.state() === "retrying" || props.state() === "working") {
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

  // Grok-like composer on the spine: ✶ is the rail terminal (no extra pad / rail-only row).
  // Brand lives in the header; box uses ❯ / ! + model meta (see Prompt).
  return (
    <box flexDirection="column" flexShrink={0} flexGrow={0} width="100%" paddingTop={0} paddingBottom={0}>
      <box
        flexDirection="row"
        paddingLeft={metrics().pad}
        flexShrink={0}
        alignItems="flex-start"
        width="100%"
      >
        <SpineRail layout={layout()} glyph={markerGlyph()} color={markerColor()} active />
        {/*
          Positioning host for the slash/@ panel.
          Prompt may render autocomplete inline above the composer.
        */}
        <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={0} overflow="visible" position="relative">
          <Prompt
            ref={props.bind}
            disabled={props.disabled()}
            visible={props.visible()}
            onSubmit={props.toBottom}
            sessionID={props.sessionID}
            variant="command-spine"
            placeholders={PLACEHOLDER}
          />
        </box>
      </box>
    </box>
  )
}
