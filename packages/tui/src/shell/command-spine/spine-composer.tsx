import { Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { spineOuterPadding, type SpineLayout } from "./spine-types"
import type { SpineViewFilter } from "./spine-view-filter"
import type { PromptRef } from "../../component/prompt"
import { SubagentFooter } from "../../routes/session/subagent-footer"
import { SpinePrompt } from "./spine-prompt"

/**
 * Composer + footer region for the spine: the subagent footer (when inside a
 * child session), the view-filter hint, and the Grok-order composer prompt.
 */
export function SpineComposer(props: {
  layout: SpineLayout
  parentID?: string
  viewFilter: SpineViewFilter
  filterLabel: (filter: SpineViewFilter) => string
  bind: (r: PromptRef | undefined) => void
  disabled: () => boolean
  visible: () => boolean
  sessionID: string
  toBottom: (text?: string) => void
  state: () => "idle" | "working" | "stop"
  gutterWidth: number
}) {
  const { theme } = useTheme()
  const pad = spineOuterPadding(props.layout)

  return (
    <>
      <Show when={props.viewFilter !== "all"}>
        <box flexDirection="row" flexShrink={0} paddingLeft={pad + 2}>
          <text fg={theme.spineDiffMuted}>
            view: {props.filterLabel(props.viewFilter)} · f cycles · security states always visible
          </text>
        </box>
      </Show>
      <Show when={props.parentID}>
        <SubagentFooter />
      </Show>
      <SpinePrompt
        bind={props.bind as any}
        disabled={props.disabled}
        visible={props.visible}
        sessionID={props.sessionID}
        toBottom={props.toBottom as any}
        layout={(() => props.layout) as any}
        state={props.state}
        gutterWidth={props.gutterWidth}
      />
    </>
  )
}
