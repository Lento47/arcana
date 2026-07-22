import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { useThinkingMode } from "../../context/thinking"
import type { ShellProps } from "../types"
import { getSpineLayout } from "./spine-types"
import { SAMPLE_ENTRIES } from "./sample-entries"
import { messagesToSpineEntriesCached, type SpineEntriesCache } from "./spine-mapper"
import type { SpineEntry } from "./spine-types"
import { SpineHeader } from "./spine-header"
import { SpineEntry as SpineEntryView } from "./spine-entry"
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

// Cross-session cache: keyed by sessionID so back-switching to a session
// reuses the already-computed entries + per-message cache instead of
// re-walking the full message list. The previous per-component `let cache`
// was wiped on every session switch and forced a full re-mapper pass.
const SESSION_CACHE_LIMIT = 16
const sessionCaches = new Map<string, { cache: SpineEntriesCache; previousEntries: SpineEntry[] }>()

function getSessionCache(sessionID: string) {
  let entry = sessionCaches.get(sessionID)
  if (!entry) {
    entry = { cache: undefined as unknown as SpineEntriesCache, previousEntries: [] }
    sessionCaches.set(sessionID, entry)
    if (sessionCaches.size > SESSION_CACHE_LIMIT) {
      // Drop the oldest entry (insertion order = access order in Map).
      const oldest = sessionCaches.keys().next().value
      if (oldest && oldest !== sessionID) sessionCaches.delete(oldest)
    }
  } else {
    // LRU-ish: re-insert to mark recent.
    sessionCaches.delete(sessionID)
    sessionCaches.set(sessionID, entry)
  }
  return entry
}

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

  // Cross-session cache slot for the CURRENT session. This must be a memo,
  // not a const, because <Session /> no longer remounts on session switch —
  // a const would pin sessionState to the first session viewed, and the slow
  // path would write the new session's cache into the old session's slot,
  // corrupting the LRU. The memo re-derives on props.sessionID change.
  const sessionState = createMemo(() => getSessionCache(props.sessionID))
  let scroll: ScrollBoxRenderable | undefined
  const entryNodes = new Map<string, BoxRenderable>()

  const entries = createMemo(() => {
    if (USE_SAMPLE_SPINE) return SAMPLE_ENTRIES
    const state = sessionState()
    let cache: SpineEntriesCache = state.cache
    let previousEntries: SpineEntry[] = state.previousEntries
    // Read session status inside this memo so session.status → idle invalidates spine.
    const sessionStatusType = props.sessionStatus?.()?.type
    const result = messagesToSpineEntriesCached({
      messages: props.messages(),
      getParts: props.getParts,
      assistantDuration: props.assistantDuration(),
      cache,
      previousEntries,
      expandThinking: thinking.mode() === "show",
      sessionStatusType,
    })
    state.cache = result.cache
    state.previousEntries = result.entries
    return [...result.entries]
  })

  const gateEntries = createMemo(() =>
    pendingGateEntries({ permissions: props.permissions(), questions: props.questions() }),
  )
  const visibleEntries = createMemo(() => [...entries(), ...gateEntries()])
  // Key For by stable string ids so new entry object identity (token/streaming
  // updates) updates props without remounting rows. Grok-style: content
  // refreshes; DOM chrome stays put.
  const visibleEntryIDs = createMemo(() => visibleEntries().map((e) => e.id))
  const visibleEntryByID = createMemo(() => {
    const map = new Map<string, SpineEntry>()
    for (const e of visibleEntries()) map.set(e.id, e)
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
          <For each={visibleEntryIDs()}>
            {(id) => {
              // Stable string key keeps the row mounted; lookup pulls the latest
              // entry object so body/streaming props refresh each turn delta.
              const entry = () => visibleEntryByID().get(id)!
              return (
                <SpineEntryView
                  entry={entry()}
                  layout={layout()}
                  expanded={entryExpanded(entry())}
                  focused={entryFocused(entry())}
                  onToggle={() => toggleEntry(entry())}
                  onFocus={() => focusEntry(entry())}
                  onHover={() => focusEntry(entry())}
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
