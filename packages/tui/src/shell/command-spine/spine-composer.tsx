import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useTheme } from "../../context/theme"
import { spineOuterPadding, type SpineLayout } from "./spine-types"
import type { SpineViewFilter } from "./spine-view-filter"
import type { PromptRef } from "../../component/prompt"
import { SubagentFooter } from "../../routes/session/subagent-footer"
import { SpinePrompt, type SpinePromptState } from "./spine-prompt"
import { truncate } from "../../util/locale"
import { ShimmerText } from "../../component/shimmer-text"
import { usePromptQueue } from "../../context/prompt-queue"
import { useSpineMotion } from "./spine-motion"

/**
 * Composer + footer region for the spine: the subagent footer (when inside a
 * child session), the view-filter hint, and the Grok-order composer prompt.
 */
export function SpineComposer(props: {
  escapeStage: () => 0 | 1 | 2
  layout: SpineLayout
  parentID?: string
  viewFilter: SpineViewFilter
  filterLabel: (filter: SpineViewFilter) => string
  bind: (r: PromptRef | undefined) => void
  disabled: () => boolean
  visible: () => boolean
  sessionID: string
  toBottom: (text?: string) => void
  state: () => SpinePromptState
  /** Width of the session frame after route-level chrome. */
  contentWidth?: number
  gutterWidth: number
  focusHint?: () => string
  gateOpen?: () => boolean
  retryStatus?: () => { attempt?: number; message?: string; next?: number } | undefined
}) {
  const { theme } = useTheme()
  const motion = useSpineMotion()
  const pad = spineOuterPadding(props.layout)
  const showsWorkingCue = () => props.state() === "working" && motion?.activeCue() === "composer"
  const escapeHint = () => {
    const stage = props.escapeStage()
    if (stage === 0) return undefined
    if (stage === 1) return "esc again: leave prompt · navigate spine"
    return "esc again: interrupt session"
  }
  const hintLimit = () => {
    if (props.layout === "minimal") return 48
    if (props.layout === "narrow") return 70
    if (props.layout === "compact") return 90
    return 118
  }
  const operatorHint = () => {
    const escape = escapeHint()
    if (escape) return escape
    if (props.gateOpen?.()) return "decision active · arrows select · enter confirm"
    const retry = props.retryStatus?.()
    if (retry) {
      const seconds = Math.max(0, Math.ceil(((retry.next ?? now()) - now()) / 1000))
      return `retry ${retry.attempt ?? 1}/3${seconds > 0 ? ` in ${seconds}s` : " now"} · ${retry.message ?? "provider unavailable"}`
    }
    if (props.viewFilter !== "all") {
      return `view: ${props.filterLabel(props.viewFilter)} · f cycles · security always visible`
    }
    return props.focusHint?.() ?? ""
  }
  const hasOperatorCue = () => showsWorkingCue() || operatorHint().length > 0
  const hintColor = () => props.retryStatus?.() ? theme.warning : escapeHint() || props.gateOpen?.() ? theme.accent : theme.spineDiffMuted
  const [now, setNow] = createSignal(Date.now())
  let retryTimer: ReturnType<typeof setInterval> | undefined
  createEffect(() => {
    if (props.retryStatus?.() && !retryTimer) retryTimer = setInterval(() => setNow(Date.now()), 1000)
    if (!props.retryStatus?.() && retryTimer) {
      clearInterval(retryTimer)
      retryTimer = undefined
    }
  })
  onCleanup(() => {
    if (retryTimer) clearInterval(retryTimer)
  })

  return (
    <>
      <Show when={props.parentID}>
        <SubagentFooter />
      </Show>
      {/* Queued prompts render as linear timeline rows (steer/drop chips on
          the queued ask row) — the old composer strip was removed. */}
      {/* Idle/no-hint chrome collapses so the rounded frame starts immediately. */}
      <Show when={hasOperatorCue()}>
        <box flexDirection="row" flexShrink={0} height={1} paddingLeft={pad + 2} minWidth={0}>
          <Show
            when={showsWorkingCue()}
            fallback={<text fg={hintColor()} wrapMode="none">{truncate(operatorHint(), hintLimit())}</text>}
          >
            <ShimmerText text="Working…" active accent={theme.accent} cue="composer" animation="pulse" />
          </Show>
        </box>
      </Show>
      <SpinePrompt
        bind={props.bind as any}
        disabled={props.disabled}
        visible={props.visible}
        sessionID={props.sessionID}
        toBottom={props.toBottom as any}
        layout={(() => props.layout) as any}
        state={props.state}
        contentWidth={props.contentWidth}
        gutterWidth={props.gutterWidth}
      />
    </>
  )
}
