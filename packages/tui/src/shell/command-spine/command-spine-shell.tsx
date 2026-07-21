import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
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
import { DialogMessage } from "../../routes/session/dialog-message"
import { ARCANA_BASE_MODE, useBindings } from "../../keymap"
import { useClipboard } from "../../context/clipboard"
import { useToast } from "../../ui/toast"
import { useDialog } from "../../ui/dialog"
import { useRoute } from "../../context/route"
import { canToggleSpineEntry, nextSpineFocusID, navigableSpineEntries } from "./spine-navigation"
import { spineEntryCopyText } from "./spine-clipboard"
import { spineEntryDetailMessageID, spineEntryDiffMessageID, spineEntrySessionID } from "./spine-details"

const USE_SAMPLE_SPINE = false

export function CommandSpineShell(props: ShellProps) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const thinking = useThinkingMode()
  const renderer = useRenderer()
  const clipboard = useClipboard()
  const toast = useToast()
  const dialog = useDialog()
  const route = useRoute()
  const dims = useTerminalDimensions()
  const layout = createMemo(() => getSpineLayout(dims().width))

  let cache: ReturnType<typeof messagesToSpineEntriesCached>["cache"] | undefined
  let previousEntries: ReturnType<typeof messagesToSpineEntriesCached>["entries"] | undefined
  let cacheSessionID = props.sessionID
  let scroll: ScrollBoxRenderable | undefined
  const entryNodes = new Map<string, BoxRenderable>()

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
  // Key the list by stable entry.id so Solid <For> does NOT remount markdown
  // on every streaming token (object identity changes each mapper recompute).
  const visibleEntryIds = createMemo(() => visibleEntries().map((entry) => entry.id))
  const visibleEntryById = createMemo(() => {
    const map = new Map<string, ReturnType<typeof visibleEntries>[number]>()
    for (const entry of visibleEntries()) map.set(entry.id, entry)
    return map
  })
  const navigableEntries = createMemo(() => navigableSpineEntries(visibleEntries()))
  const runState = createMemo(() => (gateEntries().length ? "stop" : props.pending() ? "working" : "idle"))
  const [expandedEntries, setExpandedEntries] = createSignal<Record<string, boolean>>({})
  const [focusedEntryID, setFocusedEntryID] = createSignal<string | undefined>()
  const entryExpanded = (entry: { id: string; expandedByDefault?: boolean; collapsible?: boolean }) =>
    expandedEntries()[entry.id] ?? entry.expandedByDefault ?? entry.collapsible !== true
  const toggleEntry = (entry: {
    id: string
    collapsible?: boolean
    expandedByDefault?: boolean
  }) => {
    setExpandedEntries((prev) => {
      const current = prev[entry.id] ?? entry.expandedByDefault ?? entry.collapsible !== true
      return { ...prev, [entry.id]: !current }
    })
  }
  const scrollEntryIntoView = (entryID: string) => {
    queueMicrotask(() => {
      const node = entryNodes.get(entryID)
      if (!node || !scroll || scroll.isDestroyed) return

      const top = node.y - scroll.y
      const bottom = top + node.height
      const padding = 1
      if (top < padding) scroll.scrollBy(top - padding)
      else if (bottom > scroll.height - padding) scroll.scrollBy(bottom - scroll.height + padding)
    })
  }

  const focusEntryID = (entryID: string, scrollIntoView = false) => {
    setFocusedEntryID(entryID)
    if (scrollIntoView) scrollEntryIntoView(entryID)
  }
  const focusEntry = (entry: { id: string }, scrollIntoView = false) => focusEntryID(entry.id, scrollIntoView)
  const entryFocused = (entry: { id: string }) => focusedEntryID() === entry.id
  const focusRelativeEntry = (direction: -1 | 1) => {
    const nextID = nextSpineFocusID(visibleEntries(), focusedEntryID(), direction)
    if (nextID) focusEntryID(nextID, true)
  }
  const resolveFocusedEntry = (preferToggleable = false) => {
    const focused = focusedEntryID()
    let entry = focused ? visibleEntries().find((item) => item.id === focused) : undefined
    if (entry) return entry
    const pool = navigableEntries()
    const pick = preferToggleable ? pool.find((item) => canToggleSpineEntry(item)) ?? pool[0] : pool[0]
    if (pick) focusEntry(pick, true)
    return pick
  }
  const toggleFocusedEntry = () => {
    const entry = resolveFocusedEntry(true)
    if (!entry || !canToggleSpineEntry(entry)) return
    toggleEntry(entry)
  }
  const copyFocusedEntry = () => {
    const entry = resolveFocusedEntry()
    if (!entry) {
      toast.show({ message: "No spine entry to copy", variant: "info" })
      return
    }

    const text = spineEntryCopyText(entry)
    if (!text || !clipboard.write) return
    clipboard.write(text)
      .then(() => toast.show({ message: "Spine entry copied", variant: "success" }))
      .catch(() => toast.show({ message: "Failed to copy spine entry", variant: "error" }))
  }
  const openFocusedEntryDetails = () => {
    const entry = resolveFocusedEntry()
    const messageID = spineEntryDetailMessageID(entry)
    if (!messageID) {
      toast.show({ message: "No detail view is attached to this spine entry", variant: "info" })
      return
    }

    dialog.replace(() => <DialogMessage messageID={messageID} sessionID={props.sessionID} setPrompt={props.setPrompt} />)
  }
  const openFocusedEntryDiff = () => {
    const focused = focusedEntryID()
    const entry = focused ? visibleEntries().find((item) => item.id === focused) : undefined
    const messageID = spineEntryDiffMessageID(entry)
    if (!messageID) {
      const first = navigableEntries()[0]
      if (!entry && first) focusEntry(first, true)
      toast.show({ message: "No full diff is attached to this spine entry", variant: "info" })
      return
    }

    dialog.clear()
    route.navigate({
      type: "plugin",
      id: "diff",
      data: {
        mode: "last-turn",
        sessionID: props.sessionID,
        messageID,
        returnRoute: { name: "session", params: { sessionID: props.sessionID } },
      },
    })
  }
  const openFocusedEntrySession = () => {
    const focused = focusedEntryID()
    const entry = focused ? visibleEntries().find((item) => item.id === focused) : undefined
    const sessionID = spineEntrySessionID(entry)
    if (!sessionID) {
      const first = navigableEntries()[0]
      if (!entry && first) focusEntry(first, true)
      toast.show({ message: "No related session is attached to this spine entry", variant: "info" })
      return
    }

    dialog.clear()
    route.navigate({ type: "session", sessionID })
  }

  createEffect(() => {
    const focused = focusedEntryID()
    if (!focused) return
    if (!navigableEntries().some((entry) => entry.id === focused)) setFocusedEntryID(undefined)
  })

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: () => renderer.currentFocusedEditor === null && navigableEntries().length > 0,
    priority: 1,
    bindings: [
      // Prefer j/k / arrows for spine focus — Tab in the prompt is agent.cycle.
      { key: "j,down", desc: "Focus next spine entry", group: "Command Spine", cmd: () => focusRelativeEntry(1) },
      { key: "k,up", desc: "Focus previous spine entry", group: "Command Spine", cmd: () => focusRelativeEntry(-1) },
      { key: "return,space", desc: "Expand or collapse spine entry", group: "Command Spine", cmd: toggleFocusedEntry },
      { key: "y", desc: "Copy focused spine entry", group: "Command Spine", cmd: copyFocusedEntry },
      { key: "o", desc: "Open spine entry details", group: "Command Spine", cmd: openFocusedEntryDetails },
      { key: "d", desc: "Open focused spine diff", group: "Command Spine", cmd: openFocusedEntryDiff },
      { key: "g", desc: "Go to related spine session", group: "Command Spine", cmd: openFocusedEntrySession },
    ],
  }))

  return (
    <Show when={props.session()}>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <SpineHeader session={props.session} layout={layout()} segments={[] as any} />
        <scrollbox
          ref={(r) => {
            scroll = r as ScrollBoxRenderable
            props.scrollRef(r as ScrollBoxRenderable)
          }}
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
          <For each={visibleEntryIds()}>
            {(id) => {
              // Read from the live map each render so expand + streaming updates stick.
              const entry = () => visibleEntryById().get(id)!
              return (
                <SpineEntry
                  entry={entry()}
                  layout={layout()}
                  expanded={entryExpanded(entry())}
                  focused={entryFocused(entry())}
                  onToggle={() => {
                    const e = entry()
                    if (e) toggleEntry(e)
                  }}
                  onFocus={() => {
                    const e = entry()
                    if (e) focusEntry(e)
                  }}
                  onHover={() => {
                    const e = entry()
                    if (e) focusEntry(e)
                  }}
                  nodeRef={(node) => {
                    if (node) entryNodes.set(id, node)
                    else entryNodes.delete(id)
                  }}
                />
              )
            }}
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
        {/* Composer first (Grok order). Status + shortcuts bar removed for v0.3.18 —
            the SessionMetricsBar below the prompt is the single status line. The
            "◇ ready · 7   j/k:focus  enter:toggle  d:diff  o:details  y:copy" footer
            was duplicating state already shown by the metrics + the gutter rail. */}
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
