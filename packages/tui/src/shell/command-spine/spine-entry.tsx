import { MouseButton, type MouseEvent } from "@opentui/core"
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import type { Message, Part, ToolPart } from "@arcana/sdk/v2"
import { titlecase, truncate } from "../../util/locale"
import type {
  SpineEntry as SpineEntryType,
  SpineKind,
  SpineLayout,
} from "./spine-types"
import { spineOuterPadding, spineRailWidth } from "./spine-types"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { SpineGutter } from "./spine-gutter"
import { SpineNode } from "./spine-node"
import { SpineReceipt } from "./spine-receipt"
import { SpineDiff } from "./spine-diff"
import { SpineRail } from "./spine-rail"
import { SpineProse } from "./spine-prose"
import { SpineReport } from "./spine-report"
import { SpineListArtifact } from "./spine-list-artifact"
import { SpineListing } from "./spine-listing"
import { SpineChatCard } from "./spine-chat"
import { SpineApprovalGate } from "./spine-approval-gate"
import { SpineProof } from "./spine-proof"
import { taskRowChrome } from "./spine-chrome"
import {
  toSpineEntryView,
  type ApprovalEntry,
  type ChatEntry,
  type GovernanceEntry,
  type ProofEntry,
  type RecoveryEntry,
  type SpineChildView,
  type SpineEntryView,
  type SubagentEntry,
  type ToolEntry,
} from "./spine-entry-view"

/**
 * S7: single source of truth for a row's expand/toggle affordances.
 *
 * headerToggleable: the header row shows a chevron and answers header clicks.
 * rowToggleable: an explicit "show/hide ..." row renders under the header.
 *
 * PR5 (audit): a row keeps exactly ONE disclosure affordance. Every
 * toggleable row is header-toggleable, so the explicit row never duplicates
 * the header chevron. The explicit row only exists for hypothetical rows that
 * can toggle without a toggleable header.
 */
export type SpineToggleFacts = {
  onToggle: boolean
  isThink: boolean
  hasThinkBody: boolean
  hasDiff: boolean
  diffBody: string
  hasListing: boolean
  hasToolBody: boolean
  hasChildren: boolean
  childrenAreGovernance?: boolean
  childCount: number
  isAgentEntry: boolean
  expanded: boolean
  bodyLabel?: string
}

export type SpineToggle = {
  headerToggleable: boolean
  disclosure: "\u25B8" | "\u25BE" | ""
  rowToggleable: boolean
  label: string
}

export function computeSpineToggle(facts: SpineToggleFacts): SpineToggle {
  const diffBody = facts.hasDiff && facts.diffBody.trim().length > 0
  const headerToggleable =
    facts.isAgentEntry ||
    facts.hasChildren ||
    (facts.isThink && facts.hasThinkBody) ||
    diffBody ||
    facts.hasToolBody
  const disclosure: "\u25B8" | "\u25BE" | "" = headerToggleable ? (facts.expanded ? "\u25BE" : "\u25B8") : ""
  const canToggle =
    facts.onToggle || facts.isThink || facts.hasDiff || facts.hasListing || facts.hasToolBody || facts.hasChildren
  // One affordance per row: the explicit row only when the header cannot.
  const rowToggleable =
    canToggle && !headerToggleable && !facts.isThink && !facts.hasDiff &&
    (facts.hasChildren || facts.hasToolBody || facts.isAgentEntry)
  let label: string
  if (facts.hasChildren) {
    const n = facts.childCount
    const noun = facts.childrenAreGovernance === true ? "event" : "command"
    label = facts.expanded
      ? `\u25BE hide ${n} ${noun}${n === 1 ? "" : "s"}`
      : `\u25B8 show ${n} ${noun}${n === 1 ? "" : "s"}`
  } else {
    const what =
      facts.bodyLabel === "listing"
        ? "listing"
        : facts.bodyLabel === "file"
          ? "file"
          : facts.bodyLabel === "matches"
            ? "matches"
            : facts.bodyLabel ?? "details"
    label = `${facts.expanded ? "\u25BE hide" : "\u25B8 show"} ${what}`
  }
  return { headerToggleable, disclosure, rowToggleable, label }
}

/**
 * C2: a focused row's highlight must be ROW-ALIGNED. The fill + left accent
 * border live on the OUTER row box (gutter + header + body) so the highlight
 * spans the whole row. Chat prose rows are gated out: the chat voice owns its
 * own chrome (soft card + left accent), so painting the row again would
 * double-fill.
 */
export function rowFocusHighlight(focused: boolean, isChatProse: boolean): "row" | "none" {
  return focused && !isChatProse ? "row" : "none"
}

function receiptHasContent(view: SpineEntryView): boolean {
  const r = (view as ToolEntry | RecoveryEntry).receipt
  if (!r) return false
  if (r.status === "pending" || r.status === "fail") return true
  if (r.files?.length) return true
  if (r.stats && (
    r.stats.passed !== undefined
    || r.stats.failed !== undefined
    || r.stats.added !== undefined
    || r.stats.removed !== undefined
    || r.stats.duration
  )) return true
  if (view.kind === "run" && r.status === "ok") return true
  return false
}

/** Fields every non-chat row family shares for its compact header. */
type HeaderFields = {
  kind: SpineKind
  label?: string
  summary: string
  actor?: string
  elapsed?: string
  startMs?: number
  glyph: string
  streaming?: boolean
  thinking?: string
}

/** Shared compact header for every non-chat row family. */
function RowHeader(props: {
  view: HeaderFields
  layout: SpineLayout
  focused?: boolean
  disclosure: ReturnType<typeof computeSpineToggle>["disclosure"]
  nodeSummary: string
  onHeaderMouseUp?: (event: MouseEvent) => void
}) {
  return (
    <box
      flexDirection="row"
      flexShrink={0}
      alignItems="flex-start"
      onMouseUp={props.onHeaderMouseUp}
    >
      <SpineRail
        layout={props.layout}
        kind={props.view.kind}
        glyph={props.view.kind === "think" ? "" : props.view.glyph}
        active={props.focused}
      />
      <SpineNode
        kind={props.view.kind}
        label={props.view.label}
        summary={props.nodeSummary}
        actor={props.view.actor}
        layout={props.layout}
        focused={props.focused}
        elapsed={props.view.elapsed}
        startMs={props.view.startMs}
        disclosure={props.disclosure}
        streaming={props.view.streaming === true}
        thinking={props.view.thinking}
      />
    </box>
  )
}

/** Grouped child burst (tool children / governance events) with rail continuity. */
function ChildrenGroup(props: {
  children: SpineChildView[]
  layout: SpineLayout
  contentWidth?: number
}) {
  const { theme } = useTheme()
  const count = () => props.children.length
  return (
    <For each={props.children}>
      {(child, i) => (
        <Show when={child != null}>
          <box flexDirection="column" flexShrink={0} minWidth={0}>
            <box flexDirection="row" flexShrink={0} alignItems="flex-start">
              <SpineRail
                layout={props.layout}
                glyph={i() === 0 ? "\u250C" : i() === count() - 1 ? "\u2514" : "\u251C"}
                active={false}
              />
              <box flexDirection="column" flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
                <box flexDirection="row" flexShrink={0} gap={1} minWidth={0}>
                  <box flexShrink={0} paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement}>
                    <text fg={theme.spineContext} wrapMode="none">
                      {child.label || child.kind}
                    </text>
                  </box>
                  <text fg={theme.text} wrapMode="word">
                    {child.summary || child.receipt?.command || child.label || "action"}
                  </text>
                </box>
                <Show when={child.receipt?.summary || child.elapsed}>
                  <text fg={theme.spineDiffMuted} wrapMode="word">
                    {[child.receipt?.status, child.receipt?.summary, child.elapsed].filter(Boolean).join(" \u00B7 ")}
                  </text>
                </Show>
              </box>
            </box>
            <Show when={!!child.body?.trim()}>
              <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                <SpineRail layout={props.layout} glyph="\u2502" active={false} />
                <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={2}>
                  <SpineProse
                    kind={child.kind}
                    text={child.body!}
                    bodyLabel={child.bodyLabel}
                    hint={child.bodyHint || child.summary}
                    note={child.bodyNote}
                    streaming={false}
                    focused={false}
                    contentWidth={Math.max(1, (props.contentWidth ?? 1) - spineRailWidth(props.layout) - 2)}
                  />
                </box>
              </box>
            </Show>
          </box>
        </Show>
      )}
    </For>
  )
}

export function SpineEntry(props: {
  entry: SpineEntryType
  index?: number
  layout: SpineLayout
  /** Session-global gutter width (grows past 2 cols for 100+ row sessions). */
  gutterWidth?: number
  expanded?: boolean
  focused?: boolean
  onToggle?: () => void
  onFocus?: () => void
  onHover?: () => void
  onNavigate?: (sessionID: string) => void
  /** Agent rows: called when a dive target is unresolved (no child link yet). */
  onResolveChild?: () => void
  sessionID?: string  // Parent session ID for child lookup
  /** Measured markdown wrap width (terminal minus gutters). */
  contentWidth?: number
  /** Think-body wrap width (slightly different chrome tax). */
  thinkContentWidth?: number
}) {
  // Always read through props.entry inside reactive scopes. Solid components
  // run once - capturing `const e = props.entry` freezes the first object and
  // breaks streaming updates when the shell reuses a stable For key by id.
  const entry = () => props.entry
  const { theme } = useTheme()
  const sync = useSync()

  const [localExpanded, setLocalExpanded] = createSignal(
    props.entry.expandedByDefault ?? !props.entry.collapsible,
  )
  const [openBtnHover, setOpenBtnHover] = createSignal(false)
  // Prefer controlled expanded from shell; fall back to local toggle state.
  const expanded = () => props.expanded ?? localExpanded()
  const kind = createMemo(() => entry().kind)
  // Agent entries (subagent tasks) are always interactive.
  const isAgentEntry = createMemo(() => kind() === "agent")

  // Lookup child sessionID even when source.sessionID isn't set yet (running subagents).
  const childSessionID = createMemo(() => {
    const direct = entry().source?.sessionID
    if (direct) return direct
    if (!isAgentEntry() || !props.sessionID) return undefined
    const children = sync.data.session
      ?.filter((s: any) => s.parentID === props.sessionID)
      .toSorted((a: any, b: any) => (b.time?.created ?? 0) - (a.time?.created ?? 0))
    return children?.[0]?.id
  })

  // PR5: the row render boundary is a discriminated union (spine-entry-view).
  // The flat mapper entry is classified into exactly one variant; the renderer
  // switches on the discriminant instead of poking optional fields.
  const view = createMemo(() =>
    toSpineEntryView(entry(), {
      layout: props.layout,
      focused: props.focused === true,
      expanded: expanded(),
      onToggle: props.onToggle,
      onFocus: props.onFocus,
      onHover: props.onHover,
      onNavigate: props.onNavigate,
      contentWidth: props.contentWidth,
      thinkContentWidth: props.thinkContentWidth,
      gutterWidth: props.gutterWidth,
      childSessionID: childSessionID(),
    }),
  )

  const chatView = createMemo(() => (view().type === "chat" ? (view() as ChatEntry) : undefined))
  const toolView = createMemo(() => (view().type === "tool" ? (view() as ToolEntry) : undefined))
  const approvalView = createMemo(() => (view().type === "approval" ? (view() as ApprovalEntry) : undefined))
  const governanceView = createMemo(
    () => (view().type === "governance" || view().type === "proof"
      ? (view() as GovernanceEntry | ProofEntry)
      : undefined),
  )
  const subagentView = createMemo(() => (view().type === "subagent" ? (view() as SubagentEntry) : undefined))
  const recoveryView = createMemo(() => (view().type === "recovery" ? (view() as RecoveryEntry) : undefined))
  const viewChildren = createMemo(() => {
    const v = view()
    if (v.type === "chat" || v.type === "approval") return undefined
    return (v as ToolEntry | GovernanceEntry | ProofEntry | SubagentEntry).children
  })

  const isChatProse = createMemo(() => view().type === "chat")
  const isThinkRow = createMemo(() => toolView() !== undefined && kind() === "think")
  // C2: row-aligned focus highlight - the pure policy decides, the memo maps
  // the decision to theme tokens consumed by the OUTER row box (see render).
  const rowHighlight = createMemo(() => {
    const mode = rowFocusHighlight(props.focused === true, isChatProse())
    return {
      bg: mode === "row" ? theme.backgroundElement : undefined,
      border: mode === "row" ? (["left"] as any) : undefined,
      borderColor: mode === "row" ? theme.accent : undefined,
    }
  })
  // Full prose blob for the AI/user row - already joined by the view model.
  const proseText = createMemo(() => (chatView() ? chatView()!.text : ""))
  const hasProse = createMemo(() => !!proseText().trim())
  const hasDiff = createMemo(() => !!toolView()?.diff)
  const hasListing = createMemo(() => !!(toolView()?.listing?.length || subagentView()?.listing?.length))
  const hasToolBody = createMemo(() => {
    const v = view()
    if (v.type === "chat" || isThinkRow()) return false
    const body = (v as { body?: string }).body
    return !!body?.trim() || ((v.type === "tool" || v.type === "subagent") && !!v.listing?.length)
  })
  const hasThinkBody = createMemo(() => isThinkRow() && !!toolView()?.body?.trim())
  const childCount = createMemo(() => viewChildren()?.length ?? 0)
  // PR5: a single child is a valid child group (was `> 1`).
  const hasChildren = createMemo(() => childCount() >= 1)
  const hasReceipt = createMemo(() => receiptHasContent(view()) && !hasChildren())
  const bodyExpanded = () => (isChatProse() ? true : expanded())
  const streaming = createMemo(() => (view() as { streaming?: boolean }).streaming === true)
  const entryReminders = createMemo(() => (view() as { reminders?: string[] }).reminders)

  // S7: one memo - the five overlapping predicates collapsed into the pure
  // computeSpineToggle helper (header chevron, header click, explicit row,
  // row label all derive from the same facts; no more drift).
  const toggle = createMemo(() =>
    computeSpineToggle({
      onToggle: !!props.onToggle,
      isThink: isThinkRow(),
      hasThinkBody: hasThinkBody(),
      hasDiff: hasDiff(),
      diffBody: toolView()?.diff?.body?.trim() ?? "",
      hasListing: hasListing(),
      hasToolBody: hasToolBody(),
      hasChildren: hasChildren(),
      childrenAreGovernance: viewChildren()?.some((child) => child.governance) ?? false,
      childCount: childCount(),
      isAgentEntry: isAgentEntry(),
      expanded: expanded(),
      bodyLabel: (view() as { bodyLabel?: string }).bodyLabel,
    }),
  )

  const padLeft = () => spineOuterPadding(props.layout)

  const nodeSummary = () => {
    if (isChatProse()) return ""
    // Progressive disclosure for thinking: the collapsed row is the verb +
    // duration; the reasoning title/body only appears when expanded.
    if (isThinkRow()) {
      const summary = (view() as Exclude<SpineEntryView, ChatEntry>).summary
      return expanded() ? summary : (streaming() ? "Thinking" : "Thought")
    }
    return (view() as Exclude<SpineEntryView, ChatEntry>).summary
  }

  // M4: one focus per physical click. Focus lands on mousedown (row-level
  // handleFocus); toggle actions fire on mouseup and never re-focus.
  let lastToggleAt = 0

  const handleFocus = () => {
    props.onFocus?.()
  }

  const handleHover = () => {
    props.onHover?.()
  }

  const handleToggle = (event?: Pick<MouseEvent, "stopPropagation" | "preventDefault">) => {
    event?.stopPropagation?.()
    event?.preventDefault?.()
    const now = Date.now()
    if (now - lastToggleAt < 120) return
    lastToggleAt = now
    if (props.onToggle) props.onToggle()
    else setLocalExpanded((value) => !value)
  }

  /** Row-level toggle for collapsed blocks: expands without re-focusing
   *  (focus already landed on mousedown - M4: one focus per click). */
  const handleRowToggle = (event: MouseEvent) => {
    if (event.button !== undefined && event.button !== MouseButton.LEFT && event.button !== MouseButton.RIGHT) return
    event.stopPropagation?.()
    event.preventDefault?.()
    const now = Date.now()
    if (now - lastToggleAt < 120) return
    lastToggleAt = now
    if (props.onToggle) props.onToggle()
    else setLocalExpanded((value) => !value)
  }

  // PR5: conventional left-click toggle timing - both buttons toggle on
  // mouseup (release), never on press; right-click no longer differs.
  const handleHeaderMouseUp = (event: MouseEvent) => {
    if (!toggle().headerToggleable) return
    if (event.button !== undefined && event.button !== MouseButton.LEFT && event.button !== MouseButton.RIGHT) return
    handleToggle(event)
  }

  // Subagent rows: clicking the header ENTERS the subagent's own context when a
  // child session resolves (running rows included); otherwise it toggles.
  const handleSubagentHeaderMouseUp = (event: MouseEvent) => {
    if (event.button !== undefined && event.button !== MouseButton.LEFT && event.button !== MouseButton.RIGHT) return
    const target = childSessionID()
    if (target) {
      event.stopPropagation?.()
      event.preventDefault?.()
      props.onNavigate?.(target)
      return
    }
    if (props.onResolveChild) {
      event.stopPropagation?.()
      event.preventDefault?.()
      props.onResolveChild()
      return
    }
    handleHeaderMouseUp(event)
  }

  // Chat voice lives in SpineChatCard (panel + accent line + title rule).
  // Empty prose still falls back to the compact RowHeader so a blank ask/ok
  // row does not render an empty card.

  return (
    <Show when={!entry().hidden}>
      {/* D10: id anchors this entry for the shell's scrollChildIntoView. */}
      {/* C2: the focused-row highlight lives on the ROW box (bg + left accent
          border) so it spans gutter + header + body - the inner header box
          no longer paints it. Chat prose rows resolve to none (voice chrome). */}
      <box
        id={entry().id}
        flexDirection="row"
        flexShrink={0}
        width="100%"
        paddingLeft={padLeft()}
        backgroundColor={rowHighlight().bg}
        border={rowHighlight().border}
        borderColor={rowHighlight().borderColor}
        onMouseOver={handleHover}
        onMouseDown={handleFocus}
        // Collapsed toggleable rows expand on click anywhere on the block;
        // once expanded, clicks inside the content do not collapse it (the
        // header keeps that role). Focus stays on the row either way.
        onMouseUp={toggle().headerToggleable && !expanded() ? handleRowToggle : undefined}
      >
        <SpineGutter
          index={props.index ?? entry().index}
          layout={props.layout}
          gutterWidth={props.gutterWidth}
          active={props.focused}
        />
        {/*
          flexShrink=0: never let the entry content column compress under the
          gutter. Chat/think markdown need a stable full remaining width.
        */}
        <box flexDirection="column" flexGrow={1} minWidth={0} flexShrink={0}>
          {/* Chat prose — soft card, accent line, column-aligned speaker. */}
          <Show when={chatView()}>
            {(v) => (
              <>
                <Show when={!hasProse()}>
                  <RowHeader
                    view={v() as unknown as Exclude<SpineEntryView, ChatEntry>}
                    layout={props.layout}
                    focused={props.focused}
                    disclosure={toggle().disclosure}
                    nodeSummary={nodeSummary()}
                    onHeaderMouseUp={toggle().headerToggleable ? handleHeaderMouseUp : undefined}
                  />
                </Show>
                <Show when={hasProse()}>
                  <SpineChatCard
                    kind={v().kind}
                    label={v().label}
                    text={v().text}
                    layout={props.layout}
                    elapsed={v().elapsed}
                    timestamp={v().timestamp}
                    streaming={v().streaming === true}
                    focused={props.focused}
                    reminders={v().reminders}
                    bodyLabel={v().bodyLabel}
                    contentWidth={props.contentWidth}
                  />
                </Show>
              </>
            )}
          </Show>

          {/* Tool / think / run / inspect / patch / fix rows. */}
          <Show when={toolView()}>
            {(v) => (
              <>
                <RowHeader
                  view={v()}
                  layout={props.layout}
                  focused={props.focused}
                  disclosure={toggle().disclosure}
                  nodeSummary={nodeSummary()}
                  onHeaderMouseUp={toggle().headerToggleable ? handleHeaderMouseUp : undefined}
                />

                {/* Report body - scorecard + concern callouts, visible when expanded */}
                <Show when={v().report}>
                  {(r) => (
                    <Show when={expanded()}>
                      <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                        <SpineRail layout={props.layout} active={props.focused} />
                        <box flexGrow={1} minWidth={0} flexShrink={1}>
                          <SpineReport
                            report={r()}
                            expanded={expanded()}
                            focused={props.focused}
                            contentWidth={props.contentWidth}
                          />
                        </box>
                      </box>
                    </Show>
                  )}
                </Show>

                <Show when={hasReceipt()}>
                  <box flexDirection="row" flexShrink={0}>
                    <SpineRail layout={props.layout} active={props.focused} />
                    <box flexGrow={1} minWidth={0}>
                      <SpineReceipt kind={kind()} receipt={v().receipt!} layout={props.layout} />
                    </box>
                  </box>
                </Show>
                <Show when={v().proof}>
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail layout={props.layout} active={props.focused} />
                    <box flexGrow={1} minWidth={0} flexShrink={1}>
                      <SpineProof proof={v().proof!} layout={props.layout} failed={kind() === "fail"} />
                    </box>
                  </box>
                </Show>

                {/* Thinking body - TextPart-style host (no rail sibling on prose). */}
                <Show when={hasThinkBody() && bodyExpanded()}>
                  <box
                    flexShrink={0}
                    minWidth={0}
                    width={props.thinkContentWidth ?? props.contentWidth ?? ("100%" as any)}
                    paddingLeft={3}
                    marginTop={0}
                  >
                    <SpineProse
                      kind="think"
                      text={v().body!}
                      bodyLabel="reasoning"
                      streaming={streaming()}
                      focused={props.focused}
                      reminders={entryReminders()}
                      contentWidth={props.thinkContentWidth ?? props.contentWidth}
                    />
                  </box>
                </Show>

                {/* Incantation row - compact command text before output */}
                <Show when={(kind() === "run" || kind() === "inspect") && v().receipt?.command && bodyExpanded()}>
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail layout={props.layout} active={props.focused} />
                    <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
                      <text fg={theme.spineContext}>{v().receipt!.command}</text>
                    </box>
                  </box>
                </Show>

                {/* Table artifact - stacked key/value rows instead of raw CLI table */}
                <Show when={v().table && bodyExpanded()}>
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail layout={props.layout} active={props.focused} />
                    <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
                      <SpineListArtifact
                        headers={v().table!.headers}
                        rows={v().table!.rows}
                        focused={props.focused}
                        contentWidth={props.contentWidth}
                      />
                    </box>
                  </box>
                </Show>

                {/* Directory / glob listing - plain names, no XML tags */}
                <Show when={hasListing() && bodyExpanded()}>
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail layout={props.layout} active={props.focused} />
                    <box flexGrow={1} minWidth={0} flexShrink={1}>
                      <SpineListing entries={v().listing!} note={v().bodyNote} />
                    </box>
                  </box>
                </Show>

                <Show when={hasToolBody() && bodyExpanded() && !v().table && !hasListing()}>
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail layout={props.layout} active={props.focused} />
                    <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
                      <SpineProse
                        kind={kind()}
                        text={v().body!}
                        bodyLabel={v().bodyLabel}
                        hint={v().bodyHint || v().summary}
                        note={v().bodyNote}
                        streaming={false}
                        focused={props.focused}
                        reminders={entryReminders()}
                        contentWidth={props.contentWidth}
                      />
                    </box>
                  </box>
                </Show>

                <Show when={v().diff}>
                  {(d) => (
                    <Show when={expanded()}>
                      <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                        <SpineRail layout={props.layout} active={props.focused} />
                        <box flexGrow={1} minWidth={0} flexShrink={1}>
                          <SpineDiff diff={d()} layout={props.layout} expanded={expanded()} />
                        </box>
                      </box>
                    </Show>
                  )}
                </Show>

                {/* Grouped tool burst - each child command + optional output body. */}
                <Show when={hasChildren() && expanded()}>
                  <ChildrenGroup children={v().children!} layout={props.layout} contentWidth={props.contentWidth} />
                </Show>
              </>
            )}
          </Show>

          {/* Approval row (durable approval / permission gate). */}
          <Show when={approvalView()}>
            {(v) => (
              <>
                <RowHeader
                  view={v()}
                  layout={props.layout}
                  focused={props.focused}
                  disclosure={toggle().disclosure}
                  nodeSummary={nodeSummary()}
                  onHeaderMouseUp={toggle().headerToggleable ? handleHeaderMouseUp : undefined}
                />
                {/* PENDING: no operator has acted yet - requester/agent or nothing. */}
                <Show when={v().pending && v().requester}>
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail layout={props.layout} active={props.focused} />
                    <text fg={theme.textMuted} wrapMode="word">
                      requested by {v().requester}
                    </text>
                  </box>
                </Show>
                <Show when={v().pending || v().snapshot}>
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail layout={props.layout} active={props.focused} />
                    <box flexGrow={1} minWidth={0} flexShrink={1}>
                      <SpineApprovalGate
                        entry={entry()}
                        snapshot={v().snapshot}
                        layout={props.layout}
                        focused={props.focused}
                        contentWidth={props.contentWidth}
                      />
                    </box>
                  </box>
                </Show>
                <Show when={v().body?.trim() && bodyExpanded()}>
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail layout={props.layout} active={props.focused} />
                    <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
                      <SpineProse
                        kind={kind()}
                        text={v().body!}
                        bodyLabel={v().bodyLabel}
                        hint={v().summary}
                        streaming={false}
                        focused={props.focused}
                        contentWidth={props.contentWidth}
                      />
                    </box>
                  </box>
                </Show>
              </>
            )}
          </Show>

          {/* Governance / proof rows - compact operator rows with children. */}
          <Show when={governanceView()}>
            {(v) => (
              <>
                <RowHeader
                  view={v()}
                  layout={props.layout}
                  focused={props.focused}
                  disclosure={toggle().disclosure}
                  nodeSummary={nodeSummary()}
                  onHeaderMouseUp={toggle().headerToggleable ? handleHeaderMouseUp : undefined}
                />
                <Show when={hasChildren() && expanded()}>
                  <ChildrenGroup children={v().children!} layout={props.layout} contentWidth={props.contentWidth} />
                </Show>
                <Show when={entry().proof}>
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail layout={props.layout} active={props.focused} />
                    <box flexGrow={1} minWidth={0} flexShrink={1}>
                      <SpineProof proof={entry().proof!} layout={props.layout} failed={kind() === "fail"} />
                    </box>
                  </box>
                </Show>
              </>
            )}
          </Show>

          {/* Subagent task row — a bordered block, not a transcript line. The
              header chip (animated braille while delegated, check when returned)
              leads; the card below is the working/returned panel. The card is a
              self-contained unit so the delegation reads as a box even while
              collapsed, and Enter/click on the header dives into its own context. */}
          <Show when={subagentView()}>
            {(v) => {
              const chrome = () =>
                taskRowChrome({
                  streaming: v().streaming,
                  childCount: childCount(),
                  expanded: expanded(),
                })
              const cardBody = () => {
                if (v().streaming) return ""
                if (hasToolBody() && !v().table && !hasListing()) return v().body ?? ""
                if (!hasToolBody() && v().body?.trim()) return v().body
                return ""
              }
              // Live streaming text from the child (preliminary tool result).
              const liveWorkingText = () => v().liveOutput?.trim() || ""
              const statusLine = () =>
                `${v().streaming ? "⠹" : "✓"} ${chrome().cue}${chrome().childHint ? ` · ${chrome().childHint}` : ""}` +
                `${v().streaming && v().elapsed ? ` · ${v().elapsed}` : ""}` +
                `${v().streaming && childSessionID() ? " · ↵ enter its context" : ""}`
              // Completed step list: the child session's tool calls, read from the
              // workspace-wide sync projection so the returned card shows what the
              // subagent did without navigating into its session.
              const childSteps = createMemo(() => {
                const childID = childSessionID()
                if (!childID) return []
                const messages = sync.data.message[childID] ?? []
                const steps: Array<{ label: string; status: "ok" | "fail" }> = []
                for (const msg of messages) {
                  const parts = sync.data.part[msg.id] ?? []
                  for (const part of parts) {
                    if (part.type !== "tool") continue
                    const state = (part as ToolPart).state
                    if (state.status !== "completed" && state.status !== "error") continue
                    const label = childStepLabel(part as ToolPart)
                    if (!label) continue
                    steps.push({ label, status: state.status === "error" ? "fail" : "ok" })
                  }
                }
                return steps
              })
              // Hydrate the child session's messages/parts once the session is
              // resolvable, so the step list renders without navigating away.
              // Mirrors the legacy subagent route's onMount sync.
              createEffect(() => {
                const childID = childSessionID()
                if (childID && !sync.data.message[childID]?.length && !sync.session.isSynced(childID)) {
                  void sync.session.sync(childID)
                }
              })
              return (
                <>
                  <RowHeader
                    view={v()}
                    layout={props.layout}
                    focused={props.focused}
                    disclosure={toggle().disclosure}
                    nodeSummary={nodeSummary()}
                    onHeaderMouseUp={toggle().headerToggleable ? handleSubagentHeaderMouseUp : undefined}
                  />

                  {/* Subagent card — bordered block. Single status text so
                      separators always render (box gaps are unreliable here). */}
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail layout={props.layout} active={props.focused} />
                    <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1} paddingRight={1}>
                      <box
                        flexDirection="column"
                        flexShrink={0}
                        width="100%"
                        border={["top", "bottom", "left", "right"]}
                        borderColor={v().streaming ? theme.accent : theme.spineOk}
                        backgroundColor={theme.backgroundPanel}
                        paddingLeft={1}
                        paddingRight={1}
                      >
                        <text fg={v().streaming ? theme.accent : theme.spineOk} wrapMode="none">
                          {statusLine()}
                        </text>
                        {/* Completed step list — what the subagent actually did. */}
                        <Show when={!v().streaming && childSteps().length > 0}>
                          <box flexDirection="column" paddingTop={1}>
                            <For each={childSteps()}>
                              {(step) => (
                                <text fg={step.status === "fail" ? theme.spineFail : theme.spineContext} wrapMode="word">
                                  {step.status === "fail" ? "✗" : "✓"} {step.label}
                                </text>
                              )}
                            </For>
                          </box>
                        </Show>
                        {/* Working panel while delegated — its own context, not shared.
                            When the engine relays live preliminary text (streaming subagent
                            progress), show that; otherwise fall back to the static hint. */}
                        <Show when={v().streaming}>
                          <Show when={!!liveWorkingText()} fallback={
                            <text fg={theme.spineContext} wrapMode="word">
                              Working in the {v().label || "subagent"} context — its own tools, files
                              and messages, not the shared session. Enter or click to watch it think.
                            </text>
                          }>
                            <text fg={theme.spineContext} wrapMode="word">
                              {liveWorkingText()}
                            </text>
                          </Show>
                        </Show>
                        {/* Returned report/body when expanded. */}
                        <Show when={!v().streaming && bodyExpanded() && !!cardBody()?.trim()}>
                          <box paddingTop={1}>
                            <SpineProse
                              kind={kind()}
                              text={cardBody()!}
                              bodyLabel={v().bodyLabel}
                              hint={v().bodyHint || v().summary}
                              note={v().bodyNote}
                              streaming={false}
                              focused={props.focused}
                              reminders={entryReminders()}
                              contentWidth={props.contentWidth}
                            />
                          </box>
                        </Show>
                      </box>
                    </box>
                  </box>

                  {/* Open child session - polished button with rail alignment.
                      Visible while running too (dive into its own context mid-flight). */}
                  <Show when={bodyExpanded() && !!childSessionID()}>
                    <box paddingTop={1} flexShrink={0} />
                    <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                      <SpineRail layout={props.layout} active={false} />
                      <box
                        flexGrow={1}
                        minWidth={0}
                        flexShrink={1}
                        paddingLeft={1}
                        backgroundColor={openBtnHover() ? theme.backgroundElement : undefined}
                        onMouseOver={() => setOpenBtnHover(true)}
                        onMouseOut={() => setOpenBtnHover(false)}
                        onMouseUp={() => props.onNavigate?.(childSessionID()!)}
                      >
                        <text>
                          {`\u2937 Open ${v().label || "subagent"}`}
                          <Show when={!v().streaming}>
                            <span style={{ fg: theme.spineDiffMuted }}> · its own context</span>
                          </Show>
                        </text>
                      </box>
                    </box>
                  </Show>

                  <Show when={hasChildren() && expanded()}>
                    <ChildrenGroup children={v().children!} layout={props.layout} contentWidth={props.contentWidth} />
                  </Show>
                </>
              )
            }}
          </Show>

          {/* Recovery / error row. */}
          <Show when={recoveryView()}>
            {(v) => (
              <>
                <RowHeader
                  view={v()}
                  layout={props.layout}
                  focused={props.focused}
                  disclosure={toggle().disclosure}
                  nodeSummary={nodeSummary()}
                  onHeaderMouseUp={toggle().headerToggleable ? handleHeaderMouseUp : undefined}
                />
                <Show when={hasReceipt()}>
                  <box flexDirection="row" flexShrink={0}>
                    <SpineRail layout={props.layout} active={props.focused} />
                    <box flexGrow={1} minWidth={0}>
                      <SpineReceipt kind={kind()} receipt={v().receipt!} layout={props.layout} />
                    </box>
                  </box>
                </Show>
                <Show when={v().body?.trim() && bodyExpanded()}>
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail layout={props.layout} active={props.focused} />
                    <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
                      <SpineProse
                        kind={kind()}
                        text={v().body!}
                        bodyLabel={v().bodyLabel}
                        hint={v().bodyHint || v().summary}
                        note={v().bodyNote}
                        streaming={false}
                        focused={props.focused}
                        contentWidth={props.contentWidth}
                      />
                    </box>
                  </box>
                </Show>
              </>
            )}
          </Show>
        </box>
      </box>
    </Show>
  )
}

/**
 * Compact one-line label for a completed child tool call (the step list inside
 * the returned subagent card). Prefers the tool title, then a command / path /
 * search summary from the input, mirroring the spine mapper's per-tool chrome.
 */
export function childStepLabel(part: ToolPart): string {
  const tool = part.tool || "tool"
  const state = part.state
  const title =
    "title" in state && typeof state.title === "string" && state.title.trim() ? state.title.trim() : undefined
  const input = "input" in state && state.input && typeof state.input === "object"
    ? (state.input as Record<string, unknown>)
    : undefined

  const name = titlecase(tool)
  if (title && title !== "Working") return `${name} · ${truncate(title, 60)}`

  const command = input?.command ?? input?.cmd
  if (typeof command === "string" && command.trim()) return `${name} · ${truncate(command.trim(), 60)}`
  const file = input?.filePath ?? input?.path ?? input?.file
  if (typeof file === "string" && file.trim()) return `${name} · ${truncate(file.trim(), 60)}`
  const pattern = input?.pattern
  if (typeof pattern === "string" && pattern.trim()) return `${name} · ${truncate(pattern.trim(), 60)}`
  return name
}
