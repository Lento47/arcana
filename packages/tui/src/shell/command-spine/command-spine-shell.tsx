import { For, Show, createMemo } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import type { ShellProps } from "../types"
import { getSpineLayout } from "./spine-types"
import { SAMPLE_ENTRIES } from "./sample-entries"
import { messagesToSpineEntries } from "./spine-mapper"
import { SpineHeader } from "./spine-header"
import { SpineEntry } from "./spine-entry"
import { SpinePrompt } from "./spine-prompt"
import { PermissionPrompt } from "../../routes/session/permission"
import { QuestionPrompt } from "../../routes/session/question"
import { SubagentFooter } from "../../routes/session/subagent-footer"

const USE_SAMPLE_SPINE = false

export function CommandSpineShell(props: ShellProps) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const dims = useTerminalDimensions()
  const layout = createMemo(() => getSpineLayout(dims().width))

  const entries = createMemo(() => {
    if (USE_SAMPLE_SPINE) return SAMPLE_ENTRIES
    return messagesToSpineEntries({
      messages: props.messages(),
      getParts: props.getParts,
      assistantDuration: props.assistantDuration(),
    })
  })

  return (
    <Show when={props.session()}>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <SpineHeader session={props.session} />
        <scrollbox
          ref={(r) => props.scrollRef(r as ScrollBoxRenderable)}
          viewportOptions={{
            paddingRight: props.showScrollbar() ? 1 : 0,
          }}
          verticalScrollbarOptions={{
            paddingLeft: 1,
            visible: props.showScrollbar(),
            trackOptions: {
              backgroundColor: t.backgroundElement as any,
              foregroundColor: t.border as any,
            },
          }}
          stickyScroll={true}
          stickyStart="bottom"
          flexGrow={1}
          scrollAcceleration={props.scrollAcceleration}
        >
          <For each={entries()}>
            {(entry) => <SpineEntry entry={entry} layout={layout()} />}
          </For>
        </scrollbox>
        <Show when={props.permissions().length > 0}>
          <PermissionPrompt request={props.permissions()[0] as any} />
        </Show>
        <Show when={props.permissions().length === 0 && props.questions().length > 0}>
          <QuestionPrompt request={props.questions()[0] as any} />
        </Show>
        <Show when={props.session()?.parentID}>
          <SubagentFooter />
        </Show>
        <SpinePrompt bind={props.bind} disabled={props.disabled} visible={props.visible} sessionID={props.sessionID} toBottom={props.toBottom} />
      </box>
    </Show>
  )
}
