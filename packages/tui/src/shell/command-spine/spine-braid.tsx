import { For, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../../context/theme"
import type { Theme } from "../../theme"
import type { SpineBraidChild, SpineBraidStatus, SpineLayout } from "./spine-types"

function statusColor(status: SpineBraidStatus, theme: Theme) {
  if (status === "crashed") return theme.error
  if (status === "running") return theme.spineSubagent
  return theme.spineOk
}

function statusGlyph(status: SpineBraidStatus) {
  if (status === "crashed") return "×"
  if (status === "running") return "│"
  return "✓"
}

/**
 * PR6: subagent braids. Isolated subagent sessions render as branches of the
 * same execution spine; each branch is clickable and navigates to the child
 * session. Crashes stay visible locally with "parent unaffected".
 */
export function SpineBraid(props: {
  braid: SpineBraidChild[]
  layout: SpineLayout
  onNavigate?: (sessionID: string) => void
}) {
  const { theme } = useTheme()
  const compact = () => props.layout === "minimal" || props.layout === "narrow"

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0}>
      <For each={props.braid}>
        {(child, index) => {
          const glyph = () => (index() === props.braid.length - 1 ? "└" : "├")
          const color = () => statusColor(child.status, theme)
          return (
            <box
              flexDirection="column"
              flexShrink={0}
              minWidth={0}
              onMouseUp={() => props.onNavigate?.(child.sessionID)}
            >
              <box flexDirection="row" flexShrink={0}>
                <text fg={theme.spineRail} wrapMode="none">
                  {glyph()}
                </text>
                <text fg={color()} attributes={TextAttributes.BOLD} wrapMode="none">
                  {" "}AGENT {child.agent}
                </text>
                <text fg={theme.spineDiffMuted} wrapMode="none">
                  {" "}{child.sessionID.slice(0, 8)}
                </text>
              </box>
              <Show when={!compact()}>
                <box flexDirection="row" flexShrink={0} minWidth={0}>
                  <text fg={theme.spineRail} wrapMode="none">
                    │
                  </text>
                  <text fg={statusGlyph(child.status) === "×" ? theme.error : theme.spineContext} wrapMode="word" flexGrow={1} minWidth={0}>
                    {" "}{statusGlyph(child.status)} {child.line}
                  </text>
                </box>
                <Show when={child.detail}>
                  <box flexDirection="row" flexShrink={0} minWidth={0}>
                    <text fg={theme.spineRail} wrapMode="none">
                      │
                    </text>
                    <text fg={theme.spineDiffMuted} wrapMode="word" flexGrow={1} minWidth={0}>
                      {" "}{child.detail}
                    </text>
                  </box>
                </Show>
              </Show>
            </box>
          )
        }}
      </For>
    </box>
  )
}
