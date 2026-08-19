import { ErrorBoundary, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { AuthorityAffordance } from "@arcana/core/crypto/authority-affordance"
import type { PermissionRequest } from "@arcana/sdk/v2"
import { useTheme } from "../../context/theme"
import { useKV } from "../../context/kv"
import type { ShellProps } from "../types"
import type { SpineEntry } from "./spine-types"
import { frameChrome, isDensity, spineViewportWidth } from "./spine-types"
import { useSpineLayout } from "./use-spine-layout"
import { useSpineProjection } from "./use-spine-projection"
import { useSpineNavigation } from "./use-spine-navigation"
import { useAuthorityActions } from "./use-authority-actions"
import { useSpineScroll } from "./use-spine-scroll"
import { useSpineFilters } from "./use-spine-filters"
import { SpineViewport } from "./spine-viewport"
import { AuthorityGate } from "./authority-gate"
import { SpineComposer } from "./spine-composer"
import { SpineHeader } from "./spine-header"
import { canToggleSpineEntry } from "./spine-navigation"
import { spineEscInert, spineNavigationEnabled } from "./spine-gates"
import { spineEntryCopyText } from "./spine-clipboard"
import { spineEntryDetailMessageID, spineEntryDiffMessageID, spineEntrySessionID } from "./spine-details"
import type { ApprovalSnapshotDetail } from "./approval-http-bridge"
import { PermissionInspector } from "../../routes/session/permission-inspector"
import { ApprovalInspector } from "../../routes/session/approval-inspector"
import { DialogMessage } from "../../routes/session/dialog-message"
import { ARCANA_BASE_MODE, useBindings } from "../../keymap"
import { usePromptRef } from "../../context/prompt"
import { useSDK } from "../../context/sdk"
import { useClipboard } from "../../context/clipboard"
import { useToast } from "../../ui/toast"
import { useDialog } from "../../ui/dialog"
import { useRoute } from "../../context/route"

export function CommandSpineShell(props: ShellProps) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const clipboard = useClipboard()
  const toast = useToast()
  const dialog = useDialog()
  const route = useRoute()
  const promptRef = usePromptRef()
  const sdk = useSDK()
  const dims = useTerminalDimensions()
  const [escapeStage, setEscapeStage] = createSignal<0 | 1 | 2>(0)
  let escapeResetTimer: ReturnType<typeof setTimeout> | undefined

  const advanceEscape = () => {
    const next = escapeStage() + 1
    if (next === 1) {
      promptRef.current?.focus()
    } else if (next === 2) {
      blurComposer()
      navigation.focusRelativeEntry(1)
    } else {
      if (sessionIdle()) {
        toast.show({ message: "Session is already idle", variant: "info" })
      } else {
        void sdk.client.session.abort({ sessionID: props.sessionID })
        toast.show({ message: "Interrupting session", variant: "info" })
      }
      setEscapeStage(0)
      return
    }
    setEscapeStage(next)
    if (escapeResetTimer) clearTimeout(escapeResetTimer)
    escapeResetTimer = setTimeout(() => setEscapeStage(0), 800)
  }

  onCleanup(() => {
    if (escapeResetTimer) clearTimeout(escapeResetTimer)
  })
  // Hysteresis (audit S4): feed the current layout back into getSpineLayout so
  // the dead zone engages at the 80/100/120 breakpoints - no layout flapping.
  const layout = useSpineLayout(() => dims().width)
  // Centralized width contract - computed once, passed to all children.
  // No component should subtract its own padding.
  // Density (compact/cozy/spacious) trims or widens the session frame; the
  // viewport contract subtracts exactly the frame the route renders so prose
  // width never drifts.
  const kv = useKV()
  const density = createMemo(() => {
    const stored = kv.get("density")
    return isDensity(stored) ? stored : "cozy"
  })
  const viewportWidth = createMemo(() => spineViewportWidth(dims().width, frameChrome(density())))

  // Pure data derivation: header segments, entries, governance projection,
  // approval merging, deterministic ordering, grouping, geometry, run state.
  const projection = useSpineProjection(props, { layout, viewportWidth })
  // Composer pulse-gating state (S9): the derived accessor is passed typed,
  // never as any.
  const runState = projection.runState

  // Runtime-derived authority affordances, keyed by approvalId.
  const approvalAffordances = createMemo(
    () => props.approvalAffordances?.() ?? new Map<string, readonly AuthorityAffordance[]>(),
  )
  const affordancesForApproval = (approval: { approvalId: string }): readonly AuthorityAffordance[] =>
    approvalAffordances().get(approval.approvalId) ?? []

  // Controller: use provided or create default no-op
  const controller = createMemo(() => props.approvalController)

  // Active session/workspace for isolation
  const activeSessionId = createMemo(() => props.activeSessionId?.() ?? props.sessionID)
  const activeWorkspaceId = createMemo(() => props.activeWorkspaceId?.() ?? "")

  // Approval inspector state. Audit PR-2: verified immutable request snapshot
  // for the open inspector (additive - the inspector shows hash-only metadata
  // when the snapshot is unavailable).
  const [inspectorApprovalId, setInspectorApprovalId] = createSignal<string | undefined>()
  const [inspectorSnapshot, setInspectorSnapshot] = createSignal<ApprovalSnapshotDetail | undefined>()
  const [inspectorSnapshotStatus, setInspectorSnapshotStatus] = createSignal<
    "loading" | "ready" | "missing" | "error" | undefined
  >()

  // Focus/expand state. Expanded rows stay shell-owned (not part of the
  // extracted data/navigation hooks); focus state lives in useSpineNavigation.
  const [expandedEntries, setExpandedEntries] = createSignal<Record<string, boolean>>({})
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

  // View filtering — conversation/tools/governance/all. Session proof and
  // settled deny/receipt ledger live in header chrome + governance view.
  // Pending approvals still break through via applyViewFilter.
  const filters = useSpineFilters({
    displayRows: projection.displayRows,
    sessionID: () => props.sessionID,
  })

  // Keyed by stable string ids so new entry object identity (token/streaming
  // updates) updates props without remounting rows.
  const visibleEntryIDs = createMemo(() => {
    // Defensive: a keyed <For> must never receive the same id twice.
    const ids: string[] = []
    const seen = new Set<string>()
    for (const entry of filters.filteredRows()) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      ids.push(entry.id)
    }
    return ids
  })
  const visibleEntryByID = createMemo(() => {
    const map = new Map<string, SpineEntry>()
    for (const e of filters.filteredRows()) map.set(e.id, e)
    return map
  })

  const composerFocused = () => renderer.currentFocusedEditor !== null
  const gatesOpen = () => props.permissions().length > 0 || props.questions().length > 0

  /** Leave the composer so spine keys (a/d/v/esc) are not blocked by focused-editor gating. */
  const blurComposer = () => {
    const editor = renderer.currentFocusedEditor as { blur?: () => void } | null
    if (editor && typeof editor.blur === "function") editor.blur()
  }

  // Scrolling state and actions (event-driven scroll button, audit D10).
  const scroll = useSpineScroll({ onRef: props.scrollRef })

  // Route navigation + focus state. The shell supplies the side effects
  // (controller selection, composer blur, scroll-into-view) via callbacks.
  const navigation = useSpineNavigation({
    filteredRows: filters.filteredRows,
    getApprovalForEntry: projection.getApprovalForEntry,
    onFocusApproval: (approvalId) => controller()?.select(approvalId),
    onBlurComposer: blurComposer,
    onScrollIntoView: scroll.scrollEntryIntoView,
  })

  /** Open the read-only ApprovalInspector for the live approval accessor. */
  const openApprovalInspector = (liveApproval: () => ApprovalRecord) => {
    const approval = liveApproval()
    // Audit PR-2: fetch the VERIFIED immutable request snapshot for the
    // record (additive read - the inspector shows hash-only metadata when the
    // engine has none). Guarded so a late resolution for a different approval
    // (opened then quickly replaced) never leaks into this one.
    setInspectorSnapshot(undefined)
    setInspectorSnapshotStatus("loading")
    const loader = props.approvalDetailLoader
    if (loader) {
      loader(approval.approvalId).then(
        (snapshot) => {
          if (inspectorApprovalId() !== approval.approvalId) return
          if (snapshot) {
            setInspectorSnapshot(snapshot)
            setInspectorSnapshotStatus("ready")
          } else {
            setInspectorSnapshot(undefined)
            setInspectorSnapshotStatus("missing")
          }
        },
        () => {
          if (inspectorApprovalId() === approval.approvalId) setInspectorSnapshotStatus("error")
        },
      )
    } else {
      setInspectorSnapshotStatus(undefined)
    }
    // Render from the live approvals store so the inspector stays truthful if
    // the record transitions (CLAIMED/CONSUMED) while open.
    dialog.replace(
      () => (
        <ApprovalInspector
          approval={liveApproval()}
          snapshot={inspectorSnapshot}
          snapshotStatus={inspectorSnapshotStatus}
        />
      ),
      () => {
        setInspectorApprovalId(undefined)
        setInspectorSnapshot(undefined)
        setInspectorSnapshotStatus(undefined)
        // Phase 3.2: closing the inspector leaves the entry SELECTED.
        const still = navigation.focusedApproval()
        if (still) controller()?.select(still.approvalId)
      },
    )
  }

  // Approval commands (approve/deny/inspect), submission state, focused gate
  // request, and bindings-enabled policies.
  const authority = useAuthorityActions({
    focusedEntryID: navigation.focusedEntryID,
    focusedApproval: navigation.focusedApproval,
    approvals: projection.approvals,
    getAffordancesForApproval: (approval) => affordancesForApproval(approval),
    permissions: () => props.permissions(),
    controller,
    activeSessionId,
    activeWorkspaceId,
    composerFocused,
    gatesOpen,
    onBlurComposer: blurComposer,
    onOpenInspector: openApprovalInspector,
    onClearFocus: () => navigation.setFocusedEntryID(undefined),
    setInspectorApprovalId,
    inspectorApprovalId,
  })

  // A new user turn collapses every expanded governance group. Without this,
  // one manually-expanded group (25+ events with full JSON payloads) stays
  // expanded forever and forces huge scroll distances through old turns.
  let seenUserMessageID: string | undefined
  createEffect(() => {
    const lastUser = projection.displayRows()
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

  const toggleFocusedEntry = () => {
    const entry = navigation.resolveFocusedEntry(true)
    if (!entry || !canToggleSpineEntry(entry)) return
    toggleEntry(entry)
  }
  // Enter on a focused subagent row dives into ITS OWN context (child session),
  // not the shared one. Space still toggles expand/collapse.
  const activateFocusedEntry = () => {
    const entry = navigation.resolveFocusedEntry(true)
    if (!entry) return
    if (entry.kind === "agent") {
      const sessionID = spineEntrySessionID(entry)
      if (sessionID) {
        dialog.clear()
        props.onNavigateToSession?.(sessionID) ?? route.navigate({ type: "session", sessionID })
        return
      }
      // No link yet (running card before the engine stamped metadata, or the
      // child is not in the local session list). Ask the session layer to
      // refresh and resolve it instead of silently toggling the row.
      if (props.onResolveChild) {
        props.onResolveChild(entry)
        return
      }
    }
    if (!canToggleSpineEntry(entry)) return
    toggleEntry(entry)
  }
  const copyFocusedEntry = () => {
    const entry = navigation.resolveFocusedEntry()
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
    const entry = navigation.resolveFocusedEntry()
    const messageID = spineEntryDetailMessageID(entry)
    if (!messageID) {
      toast.show({ message: "No detail view is attached to this spine entry", variant: "info" })
      return
    }

    dialog.replace(() => <DialogMessage messageID={messageID} sessionID={props.sessionID} setPrompt={props.setPrompt} />)
  }
  const openFocusedEntryDiff = () => {
    const entry = navigation.focusedEntry()
    const messageID = spineEntryDiffMessageID(entry)
    if (!messageID) {
      const first = navigation.navigableEntries()[0]
      if (!entry && first) navigation.focusEntry(first, true)
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
    const entry = navigation.focusedEntry()
    const sessionID = spineEntrySessionID(entry)
    if (!sessionID) {
      const first = navigation.navigableEntries()[0]
      if (!entry && first) navigation.focusEntry(first, true)
      toast.show({ message: "No related session is attached to this spine entry", variant: "info" })
      return
    }

    dialog.clear()
    props.onNavigateToSession?.(sessionID) ?? route.navigate({ type: "session", sessionID })
  }

  // Keyboard-only spine mode (Phase 3/4): Esc ALWAYS leaves the composer so
  // j/k/v/a/d become active - including while the session is busy.
  const sessionIdle = () => {
    const status = props.sessionStatus?.()
    return status === undefined || status.type === "idle"
  }

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    // When a permission/question gate is open, Enter/left/right go to the
    // gate's Decision prompt (gate bindings are priority 10 and win).
    // Navigation (j/k), copy (y), details (o), and inspection (v) stay
    // available so the operator can inspect while a gate is open.
    enabled: () =>
      spineNavigationEnabled({
        composerFocused: composerFocused(),
        hasRows: projection.displayRows().length > 0,
      }),
    priority: 1,
    bindings: [
      { key: "j,down", desc: "Focus next spine entry", group: "Command Spine", cmd: () => navigation.focusRelativeEntry(1) },
      { key: "k,up", desc: "Focus previous spine entry", group: "Command Spine", cmd: () => navigation.focusRelativeEntry(-1) },
      { key: "return", desc: "Enter subagent context or expand/collapse entry", group: "Command Spine", cmd: activateFocusedEntry },
      { key: "space", desc: "Expand or collapse spine entry", group: "Command Spine", cmd: toggleFocusedEntry },
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
          const gate = authority.focusedGateRequest()
          if (gate) {
            blurComposer()
            dialog.replace(() => <PermissionInspector request={gate} />)
            return
          }
          toast.show({
            message: "No approval to inspect - v inspects approvals; use o for entry details",
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
        cmd: scroll.scrollToTop,
      },
      {
        key: "G",
        desc: "Scroll to bottom of session",
        group: "Command Spine",
        cmd: scroll.scrollToBottom,
      },
      {
        key: "f",
        desc: "Cycle view filter: all - conversation - tools - governance",
        group: "Command Spine",
        cmd: filters.cycleViewFilter,
      },
    ],
  }))

  // TUI-2.1: Approval keyboard bindings - a approve, d deny, v inspect, esc
  // close inspector / clear selection. a/d/v only when an approval is
  // SELECTED and the composer is not typing.
  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: () => authority.approvalActionBindingsEnabled(),
    priority: 2, // Higher than spine navigation (priority 1); d deny beats d:diff
    bindings: [
      {
        key: "a",
        desc: "Approve once",
        group: "Approval",
        cmd: authority.approveFocused,
      },
      {
        key: "d",
        desc: "Deny approval",
        group: "Approval",
        cmd: authority.denyFocused,
      },
    ],
  }))

  // Inspection is read-only: it must work for ANY focused approval, including
  // terminal states (runbook: v - a - watch it go CLAIMED - CONSUMED).
  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: () => authority.approvalInspectBindingsEnabled(),
    priority: 2, // Same layer as a/d; beats the priority-1 spine fallback.
    bindings: [
      {
        key: "v",
        desc: "Inspect approval",
        group: "Approval",
        cmd: authority.inspectFocused,
      },
    ],
  }))

  // Esc is a three-stage operator gesture:
  //   1 -> return focus to the input prompt
  //   2 -> leave the composer and navigate the chat/spine
  //   3 -> interrupt the active session
  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: () =>
      spineEscInert({ gatesOpen: gatesOpen(), submitting: authority.approvalSubmitting() })
      && inspectorApprovalId() === undefined
      && navigation.focusedApproval() === undefined
      && dialog.stack.length === 0,
    priority: 3,
    bindings: [
      {
        key: "escape",
        desc: "Return to prompt, navigate chat, or interrupt",
        group: "Command Spine",
        cmd: advanceEscape,
      },
    ],
  }))

  // TUI-2.1 section 7 / smoke Phase 3.2: Esc closes inspector or clears selection.
  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: () =>
      spineEscInert({ gatesOpen: gatesOpen(), submitting: authority.approvalSubmitting() })
      && authority.approvalEscapeEnabled(),
    // Above session.interrupt (default 0) so Esc does not become "again to
    // interrupt" while the exact-request inspector is open.
    priority: 3,
    bindings: [
      {
        key: "escape",
        desc: "Close inspector or clear selection",
        group: "Approval",
        cmd: authority.closeInspectorOrClearSelection,
      },
    ],
  }))

  return (
    <Show when={props.session()}>
      <ErrorBoundary fallback={(error) => (
        <box flexDirection="column" padding={1} flexGrow={1}>
          <text fg={theme.text}>{`\u26A0 Spine render error: ${error.message}`}</text>
          <text fg={theme.textMuted}>Session may be partially rendered</text>
        </box>
      )}>
        <box flexDirection="column" flexGrow={1} minHeight={0}>
          <SpineHeader
            session={props.session}
            layout={layout()}
            contentWidth={viewportWidth()}
            segments={projection.headerSegments()}
            trust={projection.trust()}
            charter={projection.sessionCharter()}
            governed={projection.governedTally()}
          />
          <SpineViewport
            visibleEntryIDs={visibleEntryIDs}
            visibleEntryByID={visibleEntryByID}
            layout={layout()}
            gutterWidth={projection.gutterWidth()}
            proseWidth={projection.proseWidth()}
            thinkContentWidth={projection.thinkContentWidth()}
            entryExpanded={entryExpanded}
            entryFocused={navigation.entryFocused}
            onToggleEntry={toggleEntry}
            onFocusEntry={(entry) => navigation.focusEntry(entry)}
            onNavigate={(sid) => props.onNavigateToSession?.(sid) ?? route.navigate({ type: "session", sessionID: sid })}
            onResolveChild={props.onResolveChild}
            sessionID={route.data?.type === "session" ? (route.data as any).sessionID : undefined}
            showScrollbar={props.showScrollbar()}
            scrollAcceleration={props.scrollAcceleration}
            setScrollRef={scroll.setScrollRef}
            handleMouseScroll={scroll.handleMouseScroll}
            showScrollButton={scroll.showScrollButton()}
            onScrollButton={scroll.scrollToBottom}
          />
          <AuthorityGate permissions={props.permissions()} questions={props.questions()} />
          <SpineComposer
            escapeStage={escapeStage as () => 0 | 1 | 2}
            layout={layout()}
            parentID={props.session()?.parentID}
            viewFilter={filters.viewFilter()}
            filterLabel={filters.spineFilterLabel}
            bind={props.bind}
            disabled={props.disabled}
            visible={props.visible}
            sessionID={props.sessionID}
            toBottom={props.toBottom as any}
            state={runState}
            gutterWidth={projection.gutterWidth()}
          />
        </box>
      </ErrorBoundary>
    </Show>
  )
}
