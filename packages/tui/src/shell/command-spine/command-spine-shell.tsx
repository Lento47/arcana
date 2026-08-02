import { For, Show, createEffect, createMemo, createSignal, onMount, ErrorBoundary } from "solid-js"
import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import type { AssistantMessage } from "@arcana/sdk/v2"
import { useTheme } from "../../context/theme"
import { useThinkingMode } from "../../context/thinking"
import { useSync } from "../../context/sync"
import type { ShellProps } from "../types"
import { spineProseWidth, spineGutterDigits, spineOuterPadding, type SpineEntry } from "./spine-types"
import { shouldShowScrollButton } from "../../util/geometry"
import { messagesToSpineEntriesCached, type SpineEntriesCache } from "./spine-mapper"
import { SpineHeader } from "./spine-header"
import { buildStatusSegments } from "./spine-segments"
import { useSpineLayout } from "./use-spine-layout"
import { SpineEntryBinding } from "./spine-entry-binding"
import { SpinePrompt } from "./spine-prompt"
import { pendingGateEntries } from "./spine-gates"
import { PermissionPrompt } from "../../routes/session/permission"
import { QuestionPrompt } from "../../routes/session/question"
import { SubagentFooter } from "../../routes/session/subagent-footer"
import { DialogMessage } from "../../routes/session/dialog-message"
import { ApprovalInspector } from "../../routes/session/approval-inspector"
import { PermissionInspector } from "../../routes/session/permission-inspector"
import type { PermissionRequest } from "@arcana/sdk/v2"
import { ARCANA_BASE_MODE, useBindings } from "../../keymap"
import { usePromptRef } from "../../context/prompt"
import { useClipboard } from "../../context/clipboard"
import { useToast } from "../../ui/toast"
import { useDialog } from "../../ui/dialog"
import { useRoute } from "../../context/route"
import { canToggleSpineEntry, nextSpineFocusID, navigableSpineEntries } from "./spine-navigation"
import { spineEntryCopyText } from "./spine-clipboard"
import { spineEntryDetailMessageID, spineEntryDiffMessageID, spineEntrySessionID } from "./spine-details"
import {
  approvalIdFromEntryID,
  approvalInspectionAllowed,
  approvalToSpineEntry,
  isApprovalActionable,
  isApprovalTerminal,
} from "./approval-spine-adapter"
import { createApprovalShellController, type ApprovalShellController, type ApprovalCommandInput } from "./approval-shell-controller"
import { createDedupeKey, dedupeKeyToString, compareOrderingKeys, createOrderingKey } from "./spine-ordering"
import {
  governanceProofToSpineEntry,
  governanceTraceToSpineEntry,
  productionInputToSpineEntry,
} from "./production-spine-input"
import { groupGovernanceEntries } from "./spine-governance-group"
import {
  applyViewFilter,
  nextSpineViewFilter,
  spineFilterLabel,
  type SpineViewFilter,
} from "./spine-view-filter"

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
  const { theme } = useTheme()
  const thinking = useThinkingMode()
  const renderer = useRenderer()
  const clipboard = useClipboard()
  const toast = useToast()
  const dialog = useDialog()
  const route = useRoute()
  const promptRef = usePromptRef()
  const dims = useTerminalDimensions()
  // Hysteresis (audit S4): feed the current layout back into getSpineLayout so
  // the dead zone engages at the 80/100/120 breakpoints — no layout flapping.
  const layout = useSpineLayout(() => dims().width)
  // Centralized width contract — computed once, passed to all children.
  // No component should subtract its own padding.
  const viewportWidth = createMemo(() => dims().width)
  // Header segments (audit S3): real context fed to SpineHeader — model, branch,
  // ctx %, turn state, session id, working directory. Every source is optional;
  // the header degrades to just the brand row when nothing is available.
  // Derivation mirrors the statusbar plugin (provider catalog + last assistant
  // message + session_status) so both surfaces agree on model and pressure.
  const sync = useSync()
  const lastAssistant = createMemo(() =>
    props.messages().findLast((m): m is AssistantMessage => m.role === "assistant"),
  )
  const lastUsageAssistant = createMemo(() =>
    props.messages().findLast(
      (m): m is AssistantMessage => m.role === "assistant" && m.tokens.output > 0,
    ),
  )
  const modelName = createMemo(() => {
    const last = lastAssistant()
    if (!last) return undefined
    const provider = sync.data.provider.find((p) => p.id === last.providerID)
    return provider?.models[last.modelID]?.name ?? last.modelID
  })
  const ctxPercent = createMemo(() => {
    const last = lastUsageAssistant()
    if (!last) return null
    const tokens =
      last.tokens.input
      + last.tokens.output
      + last.tokens.reasoning
      + last.tokens.cache.read
      + last.tokens.cache.write
    const provider = sync.data.provider.find((p) => p.id === last.providerID)
    const limit = provider?.models[last.modelID]?.limit?.context
    return limit ? Math.round((tokens / limit) * 100) : null
  })
  const headerSegments = createMemo(() => {
    const session = sync.data.session.find((s) => s.id === props.sessionID)
    return buildStatusSegments({
      sessionID: props.sessionID,
      branch: sync.data.vcs?.branch,
      model: modelName(),
      ctxPercent: ctxPercent(),
      state: props.sessionStatus?.()?.type,
      path: session?.directory,
    })
  })

  // Cross-session cache slot for the CURRENT session. This must be a memo,
  // not a const, because <Session /> no longer remounts on session switch —
  // a const would pin sessionState to the first session viewed, and the slow
  // path would write the new session's cache into the old session's slot,
  // corrupting the LRU. The memo re-derives on props.sessionID change.
  const sessionState = createMemo(() => getSessionCache(props.sessionID))
  let scroll: ScrollBoxRenderable | undefined

  // Scroll-to-bottom button — event-driven (audit D10). The old 250ms poll
  // is gone; the signal is recomputed at every scroll-triggering action:
  // wheel (onMouseScroll → refreshScrollButton), keyboard focus nav
  // (scrollChildIntoView → refreshScrollButton), the button itself, and
  // initial mount. Sticky scroll keeps an at-bottom user at the bottom, so
  // no content-arrival event is needed to re-evaluate.
  const [showScrollButton, setShowScrollButton] = createSignal(false)
  // P2: view filter — conversation/tools/governance/proof/all. Security states
  // break through via applyViewFilter, so a filter never hides a denial or a
  // pending approval. Declared before any eager memo reads it (a later
  // declaration would be in the TDZ during component setup).
  const [viewFilter, setViewFilter] = createSignal<SpineViewFilter>("all")
  const cycleViewFilter = () => setViewFilter((current) => nextSpineViewFilter(current))
  const refreshScrollButton = () => {
    const s = scroll
    if (!s || s.isDestroyed) return
    setShowScrollButton(shouldShowScrollButton(s.scrollHeight, s.y, s.height))
  }

  const handleMouseScroll = (event: MouseEvent) => {
    const direction = event.scroll?.direction
    if (direction !== "up" && direction !== "down") return
    // Observe only — ScrollBox scrolls natively on wheel. Re-evaluate the
    // button against post-scroll geometry once the native scroll has applied.
    queueMicrotask(refreshScrollButton)
  }

  onMount(refreshScrollButton)

  // S6(a): memo is PURE — it returns the mapper result { entries, cache }
  // untouched and never writes cache state (create-memo.mdx: "This function
  // should be pure (it should not modify other reactive values)"). The
  // LRU/cache write is a side effect, so it lives in the createEffect keyed
  // on the memo result below — each recompute is persisted once, after the
  // memo settles, never inside the memo body.
  const entries = createMemo(() => {
    const state = sessionState()
    // Read session status inside this memo so session.status → idle invalidates spine.
    const sessionStatusType = props.sessionStatus?.()?.type
    return messagesToSpineEntriesCached({
      messages: props.messages(),
      getParts: props.getParts,
      getPartRevision: props.getPartRevision,
      assistantDuration: props.assistantDuration(),
      cache: state.cache,
      previousEntries: state.previousEntries,
      expandThinking: thinking.mode() === "show",
      sessionStatusType,
    })
  })

  // Persist the LRU/cache OUTSIDE the memo. Keyed on entries() — the fresh
  // result-object identity guarantees the effect re-runs after every memo
  // recompute, then writes into the stable per-session cache slot (a plain
  // Map field, not reactive, so no feedback loop).
  createEffect(() => {
    const result = entries()
    const state = sessionState()
    state.cache = result.cache
    state.previousEntries = result.entries
  })

  const gateEntries = createMemo(() =>
    pendingGateEntries({ permissions: props.permissions(), questions: props.questions() }),
  )
  const visibleEntries = createMemo(() => [...entries().entries, ...gateEntries()])

  // ─── TUI-2.1: Approval integration ──────────────────────────────
  // Reactive accessor for approval records — never destructure reactive props
  const approvals = createMemo(() => props.approvals?.() ?? [])

  // Approval entries derived from durable records with deduplication
  const approvalEntries = createMemo(() => {
    const seen = new Set<string>()
    const result: SpineEntry[] = []
    for (const approval of approvals()) {
      const key = dedupeKeyToString(createDedupeKey({
        approvalId: approval.approvalId,
        approvalVersion: approval.version,
      }))
      if (seen.has(key)) continue
      seen.add(key)
      result.push(approvalToSpineEntry(approval))
    }
    return result
  })

  const governanceEntries = createMemo(() => {
    const seen = new Set<string>()
    const result: SpineEntry[] = []
    const trace = props.governanceTrace?.()
    if (trace) {
      const traceEntry = governanceTraceToSpineEntry({
        sessionId: props.sessionID,
        status: trace.status,
        expectedCriticalEvents: Number(trace.expectedCriticalEvents),
        recordedCriticalEvents: Number(trace.recordedCriticalEvents),
        recordingErrors: trace.recordingErrors,
      })
      if (traceEntry) result.push(traceEntry)
    }
    for (const event of props.governance?.() ?? []) {
      const key = dedupeKeyToString(createDedupeKey({ governanceEventId: event.id }))
      if (seen.has(key)) continue
      seen.add(key)
      result.push(
        productionInputToSpineEntry({
          source: "GOVERNANCE",
          value: {
            id: event.id,
            sessionId: event.sessionId ?? props.sessionID,
            eventType: event.type,
            sequence: typeof event.sequence === "number" ? event.sequence : 0,
            timestamp: Date.parse(event.timestamp),
            actor: `${event.actor.kind}:${event.actor.id}`,
            payload: event.payload,
          },
        }),
      )
    }
    const proof = props.governanceProof?.()
    if (proof) result.push(governanceProofToSpineEntry(props.sessionID, proof))
    return result
  })

  // Merge all entries: messages + gates + durable governance + approvals.
  const allVisibleEntries = createMemo(() => {
    const seen = new Set<string>()
    const merged: SpineEntry[] = []
    for (const entry of [...visibleEntries(), ...governanceEntries(), ...approvalEntries()]) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      merged.push(entry)
    }
    // Sort by deterministic ordering key so approvals interleave with
    // messages by timestamp/source-priority, not always appended last.
    const sid = props.sessionID ?? ""
    merged.sort((a, b) => {
      const keyA = createOrderingKey({
        sessionId: sid,
        sequence: a.index,
        timestamp: a.timestamp ?? "",
        source: a.source?.kind === "governance" ? "GOVERNANCE" : a.source?.kind === "approve" ? "APPROVAL" : "MESSAGE",
        sourceEventId: a.id,
      })
      const keyB = createOrderingKey({
        sessionId: sid,
        sequence: b.index,
        timestamp: b.timestamp ?? "",
        source: b.source?.kind === "governance" ? "GOVERNANCE" : b.source?.kind === "approve" ? "APPROVAL" : "MESSAGE",
        sourceEventId: b.id,
      })
      return compareOrderingKeys(keyA, keyB)
    })
    return merged
  })

  // ─── TUI-2.1: turn grouping + progressive disclosure ────────────
  // Consecutive governance events collapse into one "governed" summary row
  // (children stay as the forensic inspector). Display indices are then
  // assigned to the collapsed top-level rows, so the gutter is real and
  // monotonic — never a repeated "99" cap.
  const groupedVisibleEntries = createMemo(() => groupGovernanceEntries(allVisibleEntries()))
  const displayRows = createMemo(() => {
    let next = 1
    return groupedVisibleEntries().map((entry) => {
      if (entry.hidden) return entry
      const withIndex = entry.index === next ? entry : { ...entry, index: next }
      next++
      return withIndex
    })
  })
  // Gutter width grows with the session (2-col minimum, 3+ for 100+ rows).
  const gutterWidth = createMemo(() =>
    spineGutterDigits(displayRows().reduce((max, entry) => Math.max(max, entry.index), 0)),
  )
  // Width contracts derive from the same gutter the rows actually use.
  const proseWidth = createMemo(() => spineProseWidth(viewportWidth(), layout(), "chat", gutterWidth()))
  const thinkWidth = createMemo(() => spineProseWidth(viewportWidth(), layout(), "think", gutterWidth()))
  // @deprecated — kept for backward compat with SpineEntry prop
  const thinkContentWidth = createMemo(() => thinkWidth())
  const filteredRows = createMemo(() => applyViewFilter(displayRows(), viewFilter()))

  // Controller: use provided or create default no-op
  const controller = createMemo(() => props.approvalController)

  // Active session/workspace for isolation
  const activeSessionId = createMemo(() => props.activeSessionId?.() ?? props.sessionID)
  const activeWorkspaceId = createMemo(() => props.activeWorkspaceId?.() ?? "")

  // Approval-specific ephemeral state
  const [approvalSubmitting, setApprovalSubmitting] = createSignal(false)
  const [inspectorApprovalId, setInspectorApprovalId] = createSignal<string | undefined>()
  // Focus/expand state MUST be declared before any memo that reads focusedEntryID
  // (TDZ: createMemo callbacks close over const bindings; using them earlier throws
  // "Cannot access 'focusedEntryID' before initialization").
  const [expandedEntries, setExpandedEntries] = createSignal<Record<string, boolean>>({})
  const [focusedEntryID, setFocusedEntryID] = createSignal<string | undefined>()

  // Helpers for approval entries
  const isApprovalEntry = (entry: SpineEntry): boolean =>
    entry.source?.kind === "approve" && entry.id.startsWith("approval:")

  // M10: single shared parse — `approval:<approvalId>:<version>` → approvalId.
  const getApprovalForEntry = (entry: SpineEntry) => {
    const id = approvalIdFromEntryID(entry.id)
    if (!id) return undefined
    return approvals().find(a => a.approvalId === id)
  }

  const focusedApproval = createMemo(() => {
    const fid = focusedEntryID()
    if (!fid) return undefined
    const entry = filteredRows().find(e => e.id === fid)
    if (!entry) return undefined
    return getApprovalForEntry(entry)
  })

  // The `01◤ approve` row is a permission-gate entry (`permission:<id>`), not
  // a durable approval record. `v` on it opens the permission inspector so
  // the operator can inspect the exact request while the gate is open.
  const focusedGateRequest = createMemo(() => {
    const fid = focusedEntryID()
    if (!fid || !fid.startsWith("permission:")) return undefined
    const requestID = fid.slice("permission:".length)
    return (props.permissions() as PermissionRequest[]).find((p) => p?.id === requestID)
  })

  const canApprove = createMemo(() => {
    const approval = focusedApproval()
    if (!approval) return false
    if (!isApprovalActionable(approval)) return false
    if (approval.sessionId !== activeSessionId()) return false
    if (approvalSubmitting()) return false
    return true
  })

  const canDeny = createMemo(() => canApprove())

  const canInspectApproval = createMemo(() => {
    const approval = focusedApproval()
    if (!approval) return false
    return true
  })
  // Key For by stable string ids so new entry object identity (token/streaming
  // updates) updates props without remounting rows. Grok-style: content
  // refreshes; DOM chrome stays put.
  const visibleEntryIDs = createMemo(() => {
    // Defensive: a keyed <For> must never receive the same id twice, or a
    // transient second row (e.g. a duplicate proof during live updates) can
    // render for one frame and then vanish.
    const ids: string[] = []
    const seen = new Set<string>()
    for (const entry of filteredRows()) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      ids.push(entry.id)
    }
    return ids
  })
  const visibleEntryByID = createMemo(() => {
    const map = new Map<string, SpineEntry>()
    for (const e of filteredRows()) map.set(e.id, e)
    return map
  })
  const navigableEntries = createMemo(() => navigableSpineEntries(filteredRows()))
  const runState = createMemo(() => {
    if (gateEntries().length) return "stop"
    // Only show "working" when both pending AND session is active.
    // Stale messages without time.completed shouldn't block idle transition.
    const sessionStatus = props.sessionStatus?.()
    const statusType = sessionStatus?.type
    const sessionActive = statusType === "busy" || statusType === "retry"
    if (props.pending() && sessionActive) return "working"
    return "idle"
  })
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
      if (!scroll || scroll.isDestroyed) return
      // D10: native DOM-style "nearest" scroll — no manual geometry math.
      // The entry root box carries id={entry.id}, resolved via
      // content.findDescendantById.
      scroll.scrollChildIntoView(entryID)
      refreshScrollButton()
    })
  }

  /** Leave the composer so TUI-2.1 spine keys (a/d/v/esc) are not blocked by focused-editor gating. */
  const blurComposer = () => {
    const editor = renderer.currentFocusedEditor as { blur?: () => void } | null
    if (editor && typeof editor.blur === "function") editor.blur()
  }

  const focusEntryID = (entryID: string, scrollIntoView = false) => {
    setFocusedEntryID(entryID)
    blurComposer()
    // Shell interaction: SELECTED when an approval entry gains spine focus.
    // M10: same parse as getApprovalForEntry — no version-suffixed select.
    const approvalId = approvalIdFromEntryID(entryID)
    if (approvalId) controller()?.select(approvalId)
    if (scrollIntoView) scrollEntryIntoView(entryID)
  }
  const focusEntry = (entry: { id: string }, scrollIntoView = false) => focusEntryID(entry.id, scrollIntoView)
  const entryFocused = (entry: { id: string }) => focusedEntryID() === entry.id
  const focusRelativeEntry = (direction: -1 | 1) => {
    const nextID = nextSpineFocusID(filteredRows(), focusedEntryID(), direction)
    if (nextID) focusEntryID(nextID, true)
  }
  const resolveFocusedEntry = (preferToggleable = false) => {
    const focused = focusedEntryID()
    let entry = focused ? filteredRows().find((item) => item.id === focused) : undefined
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
    const entry = focused ? filteredRows().find((item) => item.id === focused) : undefined
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
    const entry = focused ? filteredRows().find((item) => item.id === focused) : undefined
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

  // A new session starts with the unfiltered spine.
  createEffect(() => {
    props.sessionID
    setViewFilter("all")
  })

  // A new user turn collapses every expanded governance group. Without this,
  // one manually-expanded group (25+ events with full JSON payloads) stays
  // expanded forever and forces huge scroll distances through old turns.
  let seenUserMessageID: string | undefined
  createEffect(() => {
    const lastUser = displayRows()
      .filter((entry) => entry.kind === "ask" && entry.source?.kind === "message")
      .at(-1)
    const id = lastUser?.id
    if (!id || id === seenUserMessageID) return
    seenUserMessageID = id
    setExpandedEntries((prev) => {
      let changed = false
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        if (key.startsWith("governance-group:") && next[key] === true) {
          next[key] = false
          changed = true
        }
      }
      return changed ? next : prev
    })
  })

  // ─── TUI-2.1: Selection reconciliation ─────────────────────────
  // Clear selection when session/workspace changes
  createEffect(() => {
    const sid = activeSessionId()
    const wid = activeWorkspaceId()
    // Clear on session/workspace change
    const approval = focusedApproval()
    if (approval) {
      if (approval.sessionId !== sid || approval.workspaceId !== wid) {
        setFocusedEntryID(undefined)
        setInspectorApprovalId(undefined)
      }
    }
  })

  // Clear inspector when approval becomes terminal
  createEffect(() => {
    const inspectorId = inspectorApprovalId()
    if (!inspectorId) return
    const approval = approvals().find(a => a.approvalId === inspectorId)
    if (!approval) {
      // Approval disappeared
      setInspectorApprovalId(undefined)
      return
    }
    if (isApprovalTerminal(approval)) {
      // Keep inspector open read-only, but clear any active action
      // The terminal state is visible in the inspector
    }
  })

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    // When a permission/question gate is open, Enter/←/→ go to the gate's
    // Decision prompt (gate bindings are priority 10 and win). Navigation
    // (j/k), copy (y), details (o), and inspection (v) stay available so the
    // operator can inspect the pending approval while the gate is open;
    // decisions are still made exclusively in the gate.
    enabled: () =>
      renderer.currentFocusedEditor === null
      && displayRows().length > 0,
    priority: 1,
    bindings: [
      // Prefer j/k / arrows for spine focus — Tab in the prompt is agent.cycle.
      { key: "j,down", desc: "Focus next spine entry", group: "Command Spine", cmd: () => focusRelativeEntry(1) },
      { key: "k,up", desc: "Focus previous spine entry", group: "Command Spine", cmd: () => focusRelativeEntry(-1) },
      { key: "return,space", desc: "Expand or collapse spine entry", group: "Command Spine", cmd: toggleFocusedEntry },
      { key: "y", desc: "Copy focused spine entry", group: "Command Spine", cmd: copyFocusedEntry },
      { key: "o", desc: "Open spine entry details", group: "Command Spine", cmd: openFocusedEntryDetails },
      {
        key: "v",
        desc: "Inspect approval",
        group: "Command Spine",
        // Approval rows are handled by the priority-2 approval layer. This
        // fallback runs when no durable approval is focused: permission-gate
        // rows open the read-only permission inspector; everything else gets
        // guidance (the generic details view is `o`).
        cmd: () => {
          const gate = focusedGateRequest()
          if (gate) {
            blurComposer()
            dialog.replace(() => <PermissionInspector request={gate} />)
            return
          }
          toast.show({
            message: "No approval to inspect — v inspects approvals; use o for entry details",
            variant: "info",
          })
        },
      },
      { key: "d", desc: "Open focused spine diff", group: "Command Spine", cmd: openFocusedEntryDiff },
      { key: "g", desc: "Go to related spine session", group: "Command Spine", cmd: openFocusedEntrySession },
      {
        key: "H",
        desc: "Scroll to top of session",
        group: "Command Spine",
        cmd: () => {
          if (scroll && !scroll.isDestroyed) {
            scroll.scrollTo(0)
            refreshScrollButton()
          }
        },
      },
      {
        key: "G",
        desc: "Scroll to bottom of session",
        group: "Command Spine",
        cmd: () => {
          if (scroll && !scroll.isDestroyed) {
            scroll.scrollTo(scroll.scrollHeight)
            refreshScrollButton()
          }
        },
      },
      {
        key: "f",
        desc: "Cycle view filter: all → conversation → tools → governance → proof",
        group: "Command Spine",
        cmd: cycleViewFilter,
      },
    ],
  }))

  // ─── TUI-2.1: Approval keyboard bindings ────────────────────────
  // Docs (TUI-2.1 §7): a approve · d deny · v inspect · esc close inspector / clear selection.
  // a/d/v only when an approval is SELECTED and the composer is not typing (Phase 6).
  // esc is split out so INSPECTING can always close the inspector (including when
  // the composer still has focus — otherwise session.interrupt steals Escape).
  const gatesOpen = () => props.permissions().length > 0 || props.questions().length > 0
  const composerFocused = () => renderer.currentFocusedEditor !== null

  const approvalActionBindingsEnabled = () =>
    !composerFocused()
    && !gatesOpen()
    && !approvalSubmitting()
    && focusedApproval() !== undefined
    && isApprovalActionable(focusedApproval()!)

  // Inspection is read-only: it must work for ANY focused approval, including
  // APPROVED/CLAIMED/CONSUMED/terminal states (runbook: v → a → watch it go
  // CLAIMED → CONSUMED). Only a/d stay gated on PENDING.
  const approvalInspectBindingsEnabled = () =>
    approvalInspectionAllowed({
      hasFocusedApproval: focusedApproval() !== undefined,
      composerFocused: composerFocused(),
      submitting: approvalSubmitting(),
    })

  // Close inspector whenever open; clear selection only when spine has focus.
  const approvalEscapeEnabled = () =>
    !gatesOpen()
    && !approvalSubmitting()
    && (
      inspectorApprovalId() !== undefined
      || (focusedApproval() !== undefined && !composerFocused())
    )

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: () => approvalActionBindingsEnabled(),
    priority: 2, // Higher than spine navigation (priority 1); d deny beats d:diff
    bindings: [
      {
        key: "a",
        desc: "Approve once",
        group: "Approval",
        cmd: async () => {
          const approval = focusedApproval()
          const ctrl = controller()
          if (!approval || !ctrl || !canApprove()) return
          setApprovalSubmitting(true)
          try {
            await ctrl.approveOnce({
              approvalId: approval.approvalId,
              expectedVersion: approval.version,
              expectedRequestHash: approval.requestHash,
              expectedContractRevision: approval.contractRevision,
            })
          } finally {
            setApprovalSubmitting(false)
          }
        },
      },
      {
        key: "d",
        desc: "Deny approval",
        group: "Approval",
        cmd: async () => {
          const approval = focusedApproval()
          const ctrl = controller()
          if (!approval || !ctrl || !canDeny()) return
          setApprovalSubmitting(true)
          try {
            await ctrl.deny({
              approvalId: approval.approvalId,
              expectedVersion: approval.version,
              expectedRequestHash: approval.requestHash,
              expectedContractRevision: approval.contractRevision,
            })
          } finally {
            setApprovalSubmitting(false)
          }
        },
      },
    ],
  }))

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: () => approvalInspectBindingsEnabled(),
    priority: 2, // Same layer as a/d; beats the priority-1 spine fallback.
    bindings: [
      {
        key: "v",
        desc: "Inspect approval",
        group: "Approval",
        cmd: () => {
          const approval = focusedApproval()
          if (!approval || !canInspectApproval()) return
          blurComposer()
          setInspectorApprovalId(approval.approvalId)
          controller()?.inspect(approval.approvalId)
          // Render from the live approvals store so the inspector stays
          // truthful if the record transitions (CLAIMED/CONSUMED) while open.
          const liveApproval = () =>
            approvals().find((x) => x.approvalId === approval.approvalId) ?? approval
          dialog.replace(
            () => <ApprovalInspector approval={liveApproval()} />,
            () => {
              setInspectorApprovalId(undefined)
              // Phase 3.2: closing the inspector leaves the entry SELECTED.
              const still = focusedApproval()
              if (still) controller()?.select(still.approvalId)
            },
          )
        },
      },
    ],
  }))

  // Keyboard-only spine mode (Phase 3/4): Esc ALWAYS leaves the composer so
  // j/k/v/a/d become active — including while the session is busy. Esc from
  // the composer must never cancel the turn (operators navigate and inspect
  // during streaming; interrupt remains explicit via the palette command).
  // With nothing focused, Esc returns to the composer.
  const sessionIdle = () => {
    const status = props.sessionStatus?.()
    return status === undefined || status.type === "idle"
  }

  // A parked durable approval keeps the turn BUSY while it waits for the
  // operator. Esc must still leave the composer in that state — otherwise
  // the approval keys (a/d/v) are unreachable exactly when they matter.
  const hasPendingApproval = createMemo(() =>
    approvals().some(
      (a) => a.state === "PENDING" && a.sessionId === activeSessionId(),
    ),
  )

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: () =>
      composerFocused()
      && !gatesOpen()
      && !approvalSubmitting()
      && displayRows().length > 0,
    priority: 3,
    bindings: [
      {
        key: "escape",
        desc: "Leave composer and activate spine keys (never interrupts)",
        group: "Command Spine",
        cmd: () => blurComposer(),
      },
    ],
  }))

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: () =>
      !composerFocused()
      && !gatesOpen()
      && !approvalSubmitting()
      && inspectorApprovalId() === undefined
      && focusedApproval() === undefined
      && (sessionIdle() || hasPendingApproval()),
    priority: 3,
    bindings: [
      {
        key: "escape",
        desc: "Return focus to composer",
        group: "Command Spine",
        cmd: () => promptRef.current?.focus(),
      },
    ],
  }))

  // TUI-2.1 §7 / smoke Phase 3.2: Esc closes inspector or clears selection.
  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: () => approvalEscapeEnabled(),
    // Above session.interrupt (default 0) so Esc does not become "again to interrupt"
    // while the exact-request inspector is open.
    priority: 3,
    bindings: [
      {
        key: "escape",
        desc: "Close inspector or clear selection",
        group: "Approval",
        cmd: () => {
          if (inspectorApprovalId()) {
            setInspectorApprovalId(undefined)
            // Stay SELECTED on the approval entry after closing inspector.
            const approval = focusedApproval()
            if (approval) controller()?.select(approval.approvalId)
            return
          }
          if (focusedApproval()) {
            setFocusedEntryID(undefined)
            controller()?.clearSelection()
          }
        },
      },
    ],
  }))

  return (
    <Show when={props.session()}>
      <ErrorBoundary fallback={(error) => (
        <box flexDirection="column" padding={1} flexGrow={1}>
          <text fg={theme.text}>⚠ Spine render error: {error.message}</text>
          <text fg={theme.textMuted}>Session may be partially rendered</text>
        </box>
      )}>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <SpineHeader session={props.session} layout={layout()} segments={headerSegments()} />
        <box position="relative" flexDirection="column" flexGrow={1}>
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
                backgroundColor: theme.backgroundElement,
                foregroundColor: theme.border,
              },
            }}
            viewportCulling={true}
            stickyScroll={true}
            stickyStart="bottom"
            flexGrow={1}
            scrollAcceleration={props.scrollAcceleration}
            onMouseScroll={handleMouseScroll}
          >
            <For each={visibleEntryIDs()}>
              {(id) => {
                // IMPORTANT: A keyed Solid <For> runs this child once per id. Never
                // capture the entry object here; doing so freezes the first streamed
                // prefix until restart. The binding must resolve the current object.
                const getEntry = () => visibleEntryByID().get(id)
                return (
                  <SpineEntryBinding
                    getEntry={getEntry}
                    layout={layout()}
                    gutterWidth={gutterWidth()}
                    contentWidth={proseWidth()}
                    thinkContentWidth={thinkContentWidth()}
                    expanded={entryExpanded(getEntry()!)}
                    focused={entryFocused(getEntry()!)}
                    onToggle={() => {
                      const entry = getEntry()
                      if (entry) toggleEntry(entry)
                    }}
                    onFocus={() => {
                      const entry = getEntry()
                      if (entry) focusEntry(entry)
                    }}
                    onNavigate={(sid) => route.navigate({ type: "session", sessionID: sid })}
                    sessionID={route.data?.type === "session" ? (route.data as any).sessionID : undefined}
                  />
                )
              }}
            </For>
          </scrollbox>
          <Show when={showScrollButton()}>
            <box
              position="absolute"
              bottom={2}
              right={4}
              zIndex={50}
              width={3}
              height={1}
              onMouseUp={() => {
                if (scroll && !scroll.isDestroyed) {
                  scroll.scrollTo(scroll.scrollHeight)
                  refreshScrollButton()
                }
              }}
            >
              <text fg={theme.accent}>↓</text>
            </box>
          </Show>
        </box>
        <Show when={props.permissions().length > 0}>
          <PermissionPrompt request={props.permissions()[0] as any} />
        </Show>
        <Show when={props.permissions().length === 0 && props.questions().length > 0}>
          <QuestionPrompt request={props.questions()[0] as any} />
        </Show>
        <Show when={viewFilter() !== "all"}>
          <box flexDirection="row" flexShrink={0} paddingLeft={spineOuterPadding(layout()) + 2}>
            <text fg={theme.spineDiffMuted}>
              view: {spineFilterLabel(viewFilter())} · f cycles · security states always visible
            </text>
          </box>
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
          state={runState}
          gutterWidth={gutterWidth()}
        />
      </box>
      </ErrorBoundary>
    </Show>
  )
}
