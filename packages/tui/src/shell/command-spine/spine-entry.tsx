import { MouseButton, type MouseEvent } from "@opentui/core"
import { For, Show, createMemo, createSignal } from "solid-js"
import type { SpineEntry as SpineEntryType, SpineLayout } from "./spine-types"
import { spineOuterPadding, spineRailWidth } from "./spine-types"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { SpineGutter } from "./spine-gutter"
import { SpineNode } from "./spine-node"
import { SpineReceipt } from "./spine-receipt"
import { SpineDiff } from "./spine-diff"
import { SpineRail } from "./spine-rail"
import { SpineProse, joinSpineProse } from "./spine-prose"
import { SpineChatCard } from "./spine-chat"
import { SpineReport } from "./spine-report"
import { SpineListArtifact } from "./spine-list-artifact"
import { SpineListing } from "./spine-listing"

/**
 * S7: single source of truth for a row's expand/toggle affordances.
 *
 * The five overlapping predicates this replaces (canToggle / showToggleRow /
 * toggleLabel / headerDisclosure / headerToggleable) each re-derived the same
 * "can this row toggle?" rule and had drifted — headerToggleable required a
 * think body and included agent entries, while canToggle used bare isThink()
 * and omitted agent entries. One pure function + one memo in SpineEntry now.
 *
 * headerToggleable: the header row shows a chevron and answers header clicks.
 * rowToggleable: an explicit "show/hide …" row renders under the header.
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
  disclosure: "▸" | "▾" | ""
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
  const disclosure: "▸" | "▾" | "" = headerToggleable ? (facts.expanded ? "▾" : "▸") : ""
  const canToggle =
    facts.onToggle || facts.isThink || facts.hasDiff || facts.hasListing || facts.hasToolBody || facts.hasChildren
  const rowToggleable =
    canToggle && !facts.isThink && !facts.hasDiff && (facts.hasChildren || facts.hasToolBody || facts.isAgentEntry)
  let label: string
  if (facts.hasChildren) {
    const n = facts.childCount
    const noun = facts.childrenAreGovernance === true ? "event" : "command"
    label = facts.expanded
      ? `▾ hide ${n} ${noun}${n === 1 ? "" : "s"}`
      : `▸ show ${n} ${noun}${n === 1 ? "" : "s"}`
  } else {
    const what =
      facts.bodyLabel === "listing"
        ? "listing"
        : facts.bodyLabel === "file"
          ? "file"
          : facts.bodyLabel === "matches"
            ? "matches"
            : facts.bodyLabel ?? "details"
    label = `${facts.expanded ? "▾ hide" : "▸ show"} ${what}`
  }
  return { headerToggleable, disclosure, rowToggleable, label }
}

/**
 * C2: a focused row's highlight must be ROW-ALIGNED. The fill + left accent
 * border live on the OUTER row box (gutter + header + body) so the highlight
 * spans the whole row — no 2-col un-highlighted gap at the left edge, and the
 * fill doesn't stop where the body begins. Chat prose rows are gated out: the
 * chat card owns its own chrome (backgroundPanel + left accent in
 * SpineChatCard), so painting the row again would double-fill.
 */
export function rowFocusHighlight(focused: boolean, isChatProse: boolean): "row" | "none" {
  return focused && !isChatProse ? "row" : "none"
}

function receiptHasContent(entry: SpineEntryType): boolean {
  const r = entry.receipt
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
  if (entry.kind === "run" && r.status === "ok") return true
  return false
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
  /** Measured markdown wrap width (terminal − gutters). */
  contentWidth?: number
  /** Think-body wrap width (slightly different chrome tax). */
  thinkContentWidth?: number
}) {
  // Always read through props.entry inside reactive scopes. Solid components
  // run once — capturing `const e = props.entry` freezes the first object and
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
  const isChatProse = createMemo(() => {
    // Governance rows (proof, trace, aggregated groups) are compact operator
    // rows even when their status kind is "ok" — never chat cards.
    if (entry().source?.kind === "governance") return false
    const k = kind()
    return k === "ask" || k === "plan" || k === "ok"
  })
  // C2: row-aligned focus highlight — the pure policy decides, the memo maps
  // the decision to theme tokens consumed by the OUTER row box (see render).
  const rowHighlight = createMemo(() => {
    const mode = rowFocusHighlight(props.focused === true, isChatProse())
    return {
      bg: mode === "row" ? theme.backgroundElement : undefined,
      border: mode === "row" ? (["left"] as any) : undefined,
      borderColor: mode === "row" ? theme.accent : undefined,
    }
  })
  const isThink = createMemo(() => kind() === "think")
  // Full prose blob for the AI/user card — never summary-only (MD needs whole answer).
  const proseText = createMemo(() => {
    const e = entry()
    return joinSpineProse(e.summary, e.body)
  })
  const hasProse = createMemo(() => !!proseText().trim())
  const hasDiff = createMemo(() => !!entry().diff)
  const hasListing = createMemo(() => !!entry().listing?.length)
  const hasToolBody = createMemo(() => {
    if (isChatProse() || isThink()) return false
    return !!entry().body?.trim() || hasListing()
  })
  const hasThinkBody = createMemo(() => isThink() && !!entry().body?.trim())
  const childCount = createMemo(() => entry().children?.length ?? 0)
  const hasChildren = createMemo(() => childCount() > 1)
  const hasReceipt = createMemo(() => receiptHasContent(entry()) && !hasChildren())
  const bodyExpanded = () => (isChatProse() ? true : expanded())
  // Dedicated memo so chat/think chrome always re-evaluates when the mapper
  // flips streaming false (idle / finish / completed / missing status).
  const streaming = createMemo(() => entry().streaming === true)
  const elapsed = createMemo(() => entry().elapsed)
  const timestamp = createMemo(() => entry().timestamp)
  const entryLabel = createMemo(() => entry().label)
  const entrySummary = createMemo(() => entry().summary)
  const entryActor = createMemo(() => entry().actor)
  const entryReminders = createMemo(() => entry().reminders)
  const entryBodyLabel = createMemo(() => entry().bodyLabel)

  // Agent entries (subagent tasks) — always interactive
  const isAgentEntry = createMemo(() => kind() === "agent")

  // Lookup child sessionID even when source.sessionID isn't set yet (running subagents)
  const childSessionID = createMemo(() => {
    const direct = entry().source?.sessionID
    if (direct) return direct
    // For running subagents: find the MOST RECENT child session
    if (!isAgentEntry() || !props.sessionID) return undefined
    const children = sync.data.session
      ?.filter((s: any) => s.parentID === props.sessionID)
      .toSorted((a: any, b: any) => (b.time?.created ?? 0) - (a.time?.created ?? 0))
    return children?.[0]?.id
  })

  // S7: one memo — the five overlapping predicates collapsed into the pure
  // computeSpineToggle helper (header chevron, header click, explicit row,
  // row label all derive from the same facts; no more drift).
  const toggle = createMemo(() =>
    computeSpineToggle({
      onToggle: !!props.onToggle,
      isThink: isThink(),
      hasThinkBody: hasThinkBody(),
      hasDiff: hasDiff(),
      diffBody: entry().diff?.body?.trim() ?? "",
      hasListing: hasListing(),
      hasToolBody: hasToolBody(),
      hasChildren: hasChildren(),
      childrenAreGovernance: entry().children?.some((child) => child.source?.kind === "governance") ?? false,
      childCount: childCount(),
      isAgentEntry: isAgentEntry(),
      expanded: expanded(),
      bodyLabel: entry().bodyLabel,
    }),
  )
  const headerGlyph = () => (isChatProse() || isThink() ? "" : entry().glyph)

  const padLeft = () => spineOuterPadding(props.layout)

  const nodeSummary = () => {
    if (isChatProse()) return ""
    // Progressive disclosure for thinking: the collapsed row is the verb +
    // duration; the reasoning title/body only appears when expanded.
    if (isThink()) return expanded() ? entrySummary() : streaming() ? "Thinking" : "Thought"
    return entry().summary
  }

  // M4: one focus per physical click. The row box binds only onMouseDown
  // (immediate focus on press); the old duplicate mouseup→handleFocus binding
  // made a plain click fire onFocus twice. The suppression flag was only
  // armed by handleToggle and cleared via queueMicrotask — before the mouseup
  // task arrives — so it never caught the leaked row mouseup either. Deleted.
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
    props.onFocus?.()
    if (props.onToggle) props.onToggle()
    else setLocalExpanded((value) => !value)
  }

  /** Row-level toggle for collapsed blocks: expands without re-focusing
   *  (focus already landed on mousedown — M4: one focus per click). */
  const handleRowToggle = (event: MouseEvent) => {
    if (event.button !== undefined && event.button !== MouseButton.LEFT) return
    event.stopPropagation?.()
    event.preventDefault?.()
    const now = Date.now()
    if (now - lastToggleAt < 120) return
    lastToggleAt = now
    if (props.onToggle) props.onToggle()
    else setLocalExpanded((value) => !value)
  }

  const handleHeaderMouseDown = (event: MouseEvent) => {
    if (!toggle().headerToggleable) return
    if (event.button !== MouseButton.RIGHT) return
    handleToggle(event)
  }

  const handleHeaderMouseUp = (event: MouseEvent) => {
    if (!toggle().headerToggleable) return
    if (event.button !== undefined && event.button !== MouseButton.LEFT) return
    handleToggle(event)
  }

  return (
    <Show when={!entry().hidden}>
      {/* D10: id anchors this entry for the shell's scrollChildIntoView. */}
      {/* C2: the focused-row highlight lives on the ROW box (bg + left accent
          border) so it spans gutter + header + body — the inner header box
          no longer paints it. Chat prose rows resolve to none (card chrome). */}
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
          {/* Tool / think / gate headers — compact row (not used for chat voice). */}
          <Show when={!isChatProse() || !hasProse()}>
            <box
              flexDirection="row"
              flexShrink={0}
              alignItems="flex-start"
              onMouseDown={toggle().headerToggleable ? handleHeaderMouseDown : undefined}
              onMouseUp={toggle().headerToggleable ? handleHeaderMouseUp : undefined}
            >
              <SpineRail layout={props.layout} kind={kind()} glyph={headerGlyph()} active={props.focused} />
              <SpineNode
                kind={kind()}
                label={entryLabel()}
                summary={nodeSummary()}
                actor={entryActor()}
                layout={props.layout}
                focused={props.focused}
                elapsed={elapsed()}
                disclosure={toggle().disclosure}
                streaming={streaming()}
              />
            </box>
          </Show>

          {/* Grok-style chat card: speaker chip + soft panel + full markdown.
              Tools stay on the compact header path above — never share this chrome.
              OpenTUI MarkdownRenderable keeps trailing blocks unstable while
              streaming=true; must flip false when the assistant finishes. */}
          <Show when={isChatProse() && hasProse()}>
            <SpineChatCard
              kind={kind()}
              label={entryLabel()}
              text={proseText()}
              layout={props.layout}
              elapsed={elapsed()}
              timestamp={timestamp()}
              streaming={streaming()}
              focused={props.focused}
              reminders={entryReminders()}
              bodyLabel={entryBodyLabel()}
              contentWidth={props.contentWidth}
            />
          </Show>

          {/* Report body — scorecard + concern callouts, always visible when expanded */}
          <Show when={entry().report}>
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
                <SpineReceipt kind={kind()} receipt={entry().receipt!} layout={props.layout} />
              </box>
            </box>
          </Show>

          <Show when={toggle().rowToggleable}>
            <box flexDirection="row" flexShrink={0}>
              <SpineRail layout={props.layout} active={props.focused} />
              <text
                fg={props.focused ? theme.text : theme.spineDiffMuted}
                onMouseUp={handleToggle}
              >
                {toggle().label}
              </text>
            </box>
          </Show>

          {/* Thinking body — TextPart-style host (no rail sibling on prose). */}
          <Show when={isThink() && hasThinkBody() && bodyExpanded()}>
            <box
              flexShrink={0}
              minWidth={0}
              width={props.thinkContentWidth ?? props.contentWidth ?? ("100%" as any)}
              paddingLeft={3}
              marginTop={0}
            >
              <SpineProse
                kind="think"
                text={entry().body!}
                bodyLabel="reasoning"
                streaming={streaming()}
                focused={props.focused}
                reminders={entryReminders()}
                contentWidth={props.thinkContentWidth ?? props.contentWidth}
              />
            </box>
          </Show>

          {/* Expandable body for non-chat/non-think entries (agent tools, etc.) */}
          <Show when={!isThink() && isAgentEntry() && !hasToolBody() && bodyExpanded()}>
            <box paddingLeft={padLeft()} paddingTop={1}>
              <SpineProse
                kind={kind()}
                text={entry().body || entry().summary}
                streaming={false}
                focused={false}
                contentWidth={props.contentWidth}
              />
            </box>
          </Show>

          {/* Open child session — polished button with rail alignment */}
          <Show when={(isAgentEntry() || kind() === "agent") && bodyExpanded() && !!childSessionID()}>
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
                <text>{`⤷ Open subagent ${childSessionID()!.slice(0,8)}`}</text>
              </box>
            </box>
          </Show>

          {/* Incantation row — compact command text before output */}
          <Show when={(kind() === "run" || kind() === "inspect") && entry().receipt?.command && bodyExpanded()}>
            <box flexDirection="row" flexShrink={0} alignItems="flex-start">
              <SpineRail layout={props.layout} active={props.focused} />
              <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
                <text fg={theme.spineContext}>{entry().receipt!.command}</text>
              </box>
            </box>
          </Show>

          {/* Table artifact — stacked key/value rows instead of raw CLI table */}
          <Show when={entry().table && bodyExpanded()}>
            <box flexDirection="row" flexShrink={0} alignItems="flex-start">
              <SpineRail layout={props.layout} active={props.focused} />
              <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
                <SpineListArtifact
                  headers={entry().table!.headers}
                  rows={entry().table!.rows}
                  focused={props.focused}
                />
              </box>
            </box>
          </Show>

          {/* Directory / glob listing — plain names, no XML tags */}
          <Show when={hasListing() && bodyExpanded()}>
            <box flexDirection="row" flexShrink={0} alignItems="flex-start">
              <SpineRail layout={props.layout} active={props.focused} />
              <box flexGrow={1} minWidth={0} flexShrink={1}>
                <SpineListing entries={entry().listing!} note={entry().bodyNote} />
              </box>
            </box>
          </Show>

          <Show when={hasToolBody() && bodyExpanded() && !entry().table && !hasListing()}>
            <box flexDirection="row" flexShrink={0} alignItems="flex-start">
              <SpineRail layout={props.layout} active={props.focused} />
              <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
                <SpineProse
                  kind={kind()}
                  text={entry().body!}
                  bodyLabel={entry().bodyLabel}
                  hint={entry().bodyHint || entry().summary}
                  note={entry().bodyNote}
                  streaming={false}
                  focused={props.focused}
                  reminders={entry().reminders}
                  contentWidth={props.contentWidth}
                />
              </box>
            </box>
          </Show>

          <Show when={entry().diff}>
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

          <Show when={props.layout === "wide"}>
            <box flexDirection="row" height={1} flexShrink={0}>
              <SpineRail layout={props.layout} active={props.focused} />
              <box flexGrow={1} minWidth={0} />
            </box>
          </Show>

          {/* Grouped tool burst — each child command + optional output body. */}
          <Show when={hasChildren() && expanded()}>
            <For each={entry().children!}>
              {(child, i) => (
                <Show when={child != null}>
                <box flexDirection="column" flexShrink={0} minWidth={0}>
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail
                      layout={props.layout}
                      glyph={i() === 0 ? "┌" : i() === childCount() - 1 ? "└" : "├"}
                      active={false}
                    />
                    <box flexDirection="column" flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
                      <text fg={theme.text} wrapMode="word">
                        {child.summary || child.receipt?.command || child.label || "action"}
                      </text>
                      <Show when={child.receipt?.summary || child.elapsed}>
                        <text fg={theme.spineDiffMuted} wrapMode="word">
                          {[child.receipt?.summary, child.elapsed].filter(Boolean).join(" · ")}
                        </text>
                      </Show>
                    </box>
                  </box>
                  <Show when={!!child.body?.trim()}>
                    <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                      <SpineRail layout={props.layout} glyph="│" active={false} />
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
          </Show>
        </box>
      </box>
    </Show>
  )
}
