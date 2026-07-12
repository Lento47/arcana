import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { useThinkingMode } from "../../context/thinking"
import type { ShellProps } from "../types"
import { getSpineLayout } from "./spine-types"
import { SAMPLE_ENTRIES } from "./sample-entries"
import { messagesToSpineEntriesCached } from "./spine-mapper"
import { SpineHeader } from "./spine-header"
import { SpineEntry } from "./spine-entry"
import { SpinePrompt } from "./spine-prompt"
import { pendingGateEntries } from "./spine-gates"
import { PermissionPrompt } from "../../routes/session/permission"
import { QuestionPrompt } from "../../routes/session/question"
import { SubagentFooter } from "../../routes/session/subagent-footer"

const USE_SAMPLE_SPINE = false

export function CommandSpineShell(props: ShellProps) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const thinking = useThinkingMode()
  const dims = useTerminalDimensions()
  const layout = createMemo(() => getSpineLayout(dims().width))

  let cache: ReturnType<typeof messagesToSpineEntriesCached>["cache"] | undefined
  let previousEntries: ReturnType<typeof messagesToSpineEntriesCached>["entries"] | undefined
  let cacheSessionID = props.sessionID

  const entries = createMemo(() => {
    if (USE_SAMPLE_SPINE) return SAMPLE_ENTRIES
    if (cacheSessionID !== props.sessionID) {
      cacheSessionID = props.sessionID
      cache = undefined
      previousEntries = undefined
    }
    const result = messagesToSpineEntriesCached({
      messages: props.messages(),
      getParts: props.getParts,
      assistantDuration: props.assistantDuration(),
      cache,
      previousEntries,
      expandThinking: thinking.mode() === "show",
    })
    cache = result.cache
    previousEntries = result.entries
    return result.entries
  })

  const gateEntries = createMemo(() =>
    pendingGateEntries({ permissions: props.permissions(), questions: props.questions() }),
  )
  const visibleEntries = createMemo(() => [...entries(), ...gateEntries()])
  const runState = createMemo(() => (gateEntries().length ? "stop" : props.pending() ? "working" : "idle"))

  const [expandedEntries, setExpandedEntries] = createSignal<Record<string, boolean>>({})
  const [focusedEntryID, setFocusedEntryID] = createSignal<string | undefined>()
  const toggleEntry = (entry: { id: string; collapsible?: boolean }) => {
    setExpandedEntries((prev) => ({ ...prev, [entry.id]: !(prev[entry.id] ?? entry.collapsible === false) }))
  }
  const entryExpanded = (entry: { id: string; expandedByDefault?: boolean; collapsible?: boolean }) =>
    expandedEntries()[entry.id] ?? entry.expandedByDefault ?? !entry.collapsible
  const focusEntry = (entry: { id: string }) => setFocusedEntryID(entry.id)
  const entryFocused = (entry: { id: string }) => focusedEntryID() === entry.id

  createEffect(() => {
    const focused = focusedEntryID()
    if (!focused) return
    if (!visibleEntries().some((entry) => entry.id === focused)) setFocusedEntryID(undefined)
  })

  return (
    <Show when={props.session()}>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <SpineHeader session={props.session} layout={layout()} segments={[] as any} />
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
          viewportCulling={false}
          stickyScroll={true}
          stickyStart="bottom"
          flexGrow={1}
          scrollAcceleration={props.scrollAcceleration}
        >
          <For each={visibleEntries()}>
            {(entry) => (
              <SpineEntry
                entry={entry}
                layout={layout()}
                expanded={entryExpanded(entry)}
                focused={entryFocused(entry)}
                onToggle={() => toggleEntry(entry)}
                onFocus={() => focusEntry(entry)}
                onHover={() => focusEntry(entry)}
              />
            )}
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
        <SpinePrompt
          bind={props.bind}
          disabled={props.disabled}
          visible={props.visible}
          sessionID={props.sessionID}
          toBottom={props.toBottom as any}
          layout={layout as any}
          state={runState as any}
        />
      </box>
    </Show>
  )
}
