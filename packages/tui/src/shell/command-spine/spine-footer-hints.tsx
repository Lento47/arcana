import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { spineOuterPadding, type SpineLayout } from "./spine-types"

export type SpineRunState = "idle" | "working" | "thinking" | "stop"

export type SpineFooterSelection = {
  label: string
  actions: string[]
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
  const compact = props.layout === "minimal" || props.layout === "narrow"
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

  const proofColor = () => (active() ? ((t.spineBrand ?? t.text) as any) : ((t.spineContext ?? t.textMuted) as any))
  const stateIcon = () => (active() ? ACTIVE_PULSE[frame()] : props.state === "stop" ? "■" : "◇")
  const shimmerColor = (index: number) => {
    if (props.state !== "working") return stateColor()
    const sweep = [t.spineRun, t.spinePrompt, t.spineBrand, t.spinePrompt, t.spineRun]
    return (sweep[(frame() + index) % sweep.length] ?? t.spineRun) as any
  }
  const stateText = createMemo(() => shortState(props.state))
  const actionText = createMemo(() => props.selected?.actions.slice(0, compact ? 2 : 4).join(compact ? " " : " · "))
  const pendingLabel = createMemo(() => {
    const value = props.pending?.trim()
    if (!value) return undefined
    return value.length > 10 ? `${value.slice(0, 10)}…` : value
  })
  const pad = spineOuterPadding(props.layout)

  return (
    <box flexDirection="row" flexShrink={0} paddingLeft={pad} paddingRight={pad} height={1}>
      <box flexDirection="row" flexShrink={1} minWidth={0}>
        <text fg={proofColor()}>{compact ? "proof" : "proof tape"}</text>
        <text fg={(t.spineDiffMuted ?? t.textMuted) as any}> · </text>
        <text fg={(t.spineBrand ?? t.text) as any}>{props.entries}</text>
        <text fg={(t.spineDiffMuted ?? t.textMuted) as any}>{compact ? " ev" : " events"}</text>
        <text fg={(t.spineDiffMuted ?? t.textMuted) as any}> · </text>
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
        <Show when={gates() > 0}>
          <text fg={(t.spineFail ?? t.error) as any}> · gate {gates()}</text>
        </Show>
        <Show when={!compact && active() && pendingLabel()}>
          {(value) => <text fg={(t.spineRun ?? t.success) as any}> · run {value()}</text>}
        </Show>
        <Show when={!compact && props.viewingArtifact}>
          <text fg={(t.spinePatch ?? t.warning) as any}> · artifact</text>
        </Show>
      </box>
      <Show when={props.selected}>
        {(selected) => (
          <box flexDirection="row" flexShrink={1} minWidth={0}>
            <text fg={(t.spineDiffMuted ?? t.textMuted) as any}> · </text>
            <text fg={(t.spineBrand ?? t.text) as any}>{compact ? selected().label : `focus ${selected().label}`}</text>
            <Show when={actionText()}>
              {(actions) => <text fg={(t.spineContext ?? t.textMuted) as any}> · {actions()}</text>}
            </Show>
          </box>
        )}
      </Show>
    </box>
  )
}