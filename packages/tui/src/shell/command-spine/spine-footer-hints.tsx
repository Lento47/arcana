/**
 * Footer under the Grok-like composer.
 *
 * Split (Grok shortcuts bar + Arcana run status):
 * ```
 *   ◇ ready · 7              j/k:focus  tab:next  enter:toggle  y:copy
 *   ◈ working · gate 1       03 patch  enter:toggle  d:diff  y:copy
 * ```
 *
 * Left  = run state / events / gates (Arcana "tape" of the run)
 * Right = contextual key:label hints (Grok style)
 * "proof tape" brand word only on wide + active runs — not permanent chrome.
 */
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { type SpineLayout } from "./spine-types"
import { spineContentOffset, spineLeadMetrics } from "./spine-lead"

export type SpineRunState = "idle" | "working" | "thinking" | "stop"

export type SpineFooterHint = {
  keys: string
  label: string
}

export type SpineFooterSelection = {
  /** Focus caption, e.g. "spine" or "03 patch" */
  label: string
  /** Grok-style key/label pairs */
  hints: SpineFooterHint[]
}

const FOOTER_PULSE_MS = 220
const ACTIVE_PULSE = ["◇", "◈", "◆", "◈"]

function shortState(state: SpineRunState) {
  if (state === "idle") return "ready"
  if (state === "stop") return "gated"
  return state
}

export function SpineFooterHints(props: {
  layout: SpineLayout
  entries: number
  pending?: string
  permissions: number
  questions: number
  viewingArtifact: boolean
  state: SpineRunState
  selected?: SpineFooterSelection
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const compact = () => props.layout === "minimal" || props.layout === "narrow"
  const wide = () => props.layout === "wide"
  const gates = createMemo(() => props.permissions + props.questions)
  const [frame, setFrame] = createSignal(0)
  const active = () => props.state === "working" || props.state === "thinking"

  onMount(() => {
    const timer = setInterval(() => setFrame((value) => (value + 1) % ACTIVE_PULSE.length), FOOTER_PULSE_MS)
    onCleanup(() => clearInterval(timer))
  })

  const stateColor = () => {
    if (props.state === "stop") return (t.spineFail ?? t.error) as any
    if (props.state === "thinking") return (t.spineThink ?? t.accent) as any
    if (props.state === "working") return (t.spineRun ?? t.success) as any
    return (t.spineContext ?? t.textMuted) as any
  }

  const muted = () => (t.spineDiffMuted ?? t.textMuted) as any
  const keyColor = () => (t.spineBrand ?? t.text) as any
  const labelColor = () => (t.spineContext ?? t.textMuted) as any

  const stateIcon = () => (active() ? ACTIVE_PULSE[frame()] : props.state === "stop" ? "■" : "◇")
  const shimmerColor = (index: number) => {
    if (props.state !== "working") return stateColor()
    const sweep = [t.spineRun, t.spinePrompt, t.spineBrand, t.spinePrompt, t.spineRun]
    return (sweep[(frame() + index) % sweep.length] ?? t.spineRun) as any
  }
  const stateText = createMemo(() => shortState(props.state))
  const pendingLabel = createMemo(() => {
    const value = props.pending?.trim()
    if (!value) return undefined
    // Allow longer tool/wave hints (e.g. "tools · 2 write · wave 1 · 3 read")
    return value.length > 36 ? `${value.slice(0, 35)}…` : value
  })

  /** Cap hints so the bar never overflows into soup. */
  const hints = createMemo(() => {
    const list = props.selected?.hints ?? []
    const limit = compact() ? 2 : wide() ? 5 : 3
    return list.slice(0, limit)
  })

  const showTapeWord = createMemo(() => wide() && (active() || props.entries > 0))
  const showFocusLabel = createMemo(() => {
    const label = props.selected?.label
    if (!label || compact()) return false
    // Default "spine" focus is noise; only show when a real entry is focused.
    return label !== "spine"
  })

  // Align under the rounded composer (pad + gutter + rail), not under step numbers.
  const contentPad = spineContentOffset(props.layout)
  const rightPad = spineLeadMetrics(props.layout).pad

  return (
    <box
      flexDirection="row"
      flexShrink={0}
      paddingLeft={contentPad}
      paddingRight={rightPad}
      paddingTop={0}
      paddingBottom={0}
      height={1}
      justifyContent="space-between"
      width="100%"
    >
      {/* Left: Arcana run status */}
      <box flexDirection="row" flexShrink={1} minWidth={0} gap={0}>
        <Show when={showTapeWord()}>
          <text fg={active() ? ((t.spineBrand ?? t.text) as any) : muted()}>tape</text>
          <text fg={muted()}> · </text>
        </Show>
        <text fg={stateColor()}>{stateIcon()} </text>
        <Show
          when={props.state === "working"}
          fallback={<text fg={stateColor()}>{stateText()}</text>}
        >
          <text>
            <For each={Array.from(stateText())}>
              {(char, index) => <span style={{ fg: shimmerColor(index()) }}>{char}</span>}
            </For>
          </text>
        </Show>
        <Show when={props.entries > 0 || active()}>
          <text fg={muted()}> · </text>
          <text fg={(t.spineBrand ?? t.text) as any}>{props.entries}</text>
        </Show>
        <Show when={gates() > 0}>
          <text fg={(t.spineFail ?? t.error) as any}> · gate {gates()}</text>
        </Show>
        <Show when={!compact() && active() && pendingLabel()}>
          {(value) => <text fg={(t.spineRun ?? t.success) as any}> · {value()}</text>}
        </Show>
        <Show when={!compact() && props.viewingArtifact}>
          <text fg={(t.spinePatch ?? t.warning) as any}> · artifact</text>
        </Show>
        <Show when={showFocusLabel()}>
          <text fg={muted()}> · </text>
          <text fg={(t.spineBrand ?? t.text) as any}>{props.selected!.label}</text>
        </Show>
      </box>

      {/* Right: Grok-style key:label hints */}
      <box flexDirection="row" flexShrink={1} minWidth={0} justifyContent="flex-end">
        <For each={hints()}>
          {(hint, i) => (
            <>
              <Show when={i() > 0}>
                <text fg={muted()}>  </text>
              </Show>
              <text fg={keyColor()}>{hint.keys}</text>
              <text fg={muted()}>:</text>
              <text fg={labelColor()}>{hint.label}</text>
            </>
          )}
        </For>
      </box>
    </box>
  )
}
