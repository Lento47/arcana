import { MouseButton, type MouseEvent } from "@opentui/core"
import { For, Show, createMemo, createSignal } from "solid-js"
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
  glyph: string
  streaming?: boolean
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
        disclosure={props.disclosure}
        streaming={props.view.streaming === true}
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
                <text fg={theme.text} wrapMode="word">
                  {child.summary || child.receipt?.command || child.label || "action"}
                </text>
                <Show when={child.receipt?.summary || child.elapsed}>
                  <text fg={theme.spineDiffMuted} wrapMode="word">
                    {[child.receipt?.summary, child.elapsed].filter(Boolean).join(" \u00B7 ")}
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
              </>
            )}
          </Show>

          {/* Subagent task row. */}
          <Show when={subagentView()}>
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
                {/* Expandable body for agent entries without a tool body. */}
                <Show when={!hasToolBody() && bodyExpanded()}>
                  <box paddingLeft={padLeft()} paddingTop={1}>
                    <SpineProse
                      kind={kind()}
                      text={v().body || v().summary}
                      streaming={false}
                      focused={false}
                      contentWidth={props.contentWidth}
                    />
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

                {/* Open child session - polished button with rail alignment */}
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
                      <text>{`\u2937 Open subagent ${childSessionID()!.slice(0, 8)}`}</text>
                    </box>
                  </box>
                </Show>

                <Show when={hasChildren() && expanded()}>
                  <ChildrenGroup children={v().children!} layout={props.layout} contentWidth={props.contentWidth} />
                </Show>
              </>
            )}
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
