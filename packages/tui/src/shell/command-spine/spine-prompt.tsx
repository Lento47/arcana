import { createSignal, onCleanup, onMount } from "solid-js"
import type { PromptRef } from "../../component/prompt"
import { Prompt } from "../../component/prompt"
import { PLACEHOLDER } from "../../branding"
import { useTheme } from "../../context/theme"
import { type SpineLayout } from "./spine-types"
import { SpineGutterSpacer, spineLeadMetrics } from "./spine-lead"
import { SpineRail } from "./spine-rail"

const PROMPT_PULSE_MS = 200

export function SpinePrompt(props: {
  bind: (r: PromptRef | undefined) => void
  disabled: () => boolean
  visible: () => boolean
  sessionID: string
  /** Called after send. May receive the submitted text for optimistic UI. */
  toBottom: (text?: string) => void
  layout: () => SpineLayout
  state: () => "idle" | "working" | "thinking" | "stop"
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const layout = () => props.layout()
  const metrics = () => spineLeadMetrics(layout())
  const [pulseFrame, setPulseFrame] = createSignal(0)

  // Persistent pulse — runs while component is mounted, not gated on state.
  // State changes only swap the color palette so there's no destroy/create flicker.
  onMount(() => {
    const timer = setInterval(() => setPulseFrame((frame) => (frame + 1) % 4), PROMPT_PULSE_MS)
    onCleanup(() => clearInterval(timer))
  })

  const markerColor = () => {
    if (props.state() === "stop") return (t.spineFail ?? t.error ?? t.spinePrompt) as any
    if (props.state() === "thinking") {
      const pulse = [t.spineThink, t.spinePrompt, t.spineBrand, t.spinePrompt]
      return (pulse[pulseFrame()] ?? t.spinePrompt) as any
    }
    if (props.state() === "working") {
      const pulse = [t.spineRun, t.spinePrompt, t.spineBrand, t.spinePrompt]
      return (pulse[pulseFrame()] ?? t.spinePrompt) as any
    }
    return (t.spinePrompt ?? t.primary) as any
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
        <SpineGutterSpacer layout={layout()} />
        <SpineRail layout={layout()} glyph={"✶"} color={markerColor()} active />
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
