import { MouseButton, type BoxRenderable, type MouseEvent } from "@opentui/core"
import { For, Show, createMemo, createSignal } from "solid-js"
import type { SpineEntry as SpineEntryType, SpineLayout } from "./spine-types"
import { spineOuterPadding } from "./spine-types"
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
  expanded?: boolean
  focused?: boolean
  onToggle?: () => void
  onFocus?: () => void
  onHover?: () => void
  onNavigate?: (sessionID: string) => void
  sessionID?: string  // Parent session ID for child lookup
  nodeRef?: (node: BoxRenderable | undefined) => void
  /** Measured markdown wrap width (terminal − gutters). */
  contentWidth?: number
  /** Think-body wrap width (slightly different chrome tax). */
  thinkContentWidth?: number
}) {
  // Always read through props.entry inside reactive scopes. Solid components
  // run once — capturing `const e = props.entry` freezes the first object and
  // breaks streaming updates when the shell reuses a stable For key by id.
  const entry = () => props.entry
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const sync = useSync()

  const [localExpanded, setLocalExpanded] = createSignal(
    props.entry.expandedByDefault ?? !props.entry.collapsible,
  )
  const [openBtnHover, setOpenBtnHover] = createSignal(false)
  // Prefer controlled expanded from shell; fall back to local toggle state.
  const expanded = () => props.expanded ?? localExpanded()
  const kind = createMemo(() => entry().kind)
  const isChatProse = createMemo(() => {
    const k = kind()
    return k === "ask" || k === "plan" || k === "ok"
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
  const canToggle = createMemo(
    () => !!props.onToggle || isThink() || hasDiff() || hasListing() || hasToolBody() || hasChildren(),
  )
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

  // Explicit toggle row for tool bodies AND grouped bursts (same click target as
  // "show output" — header-only expand was easy to miss / hard to hit).
  const showToggleRow = createMemo(
    () =>
      canToggle()
      && !isThink()
      && !hasDiff()
      && (hasChildren() || hasToolBody() || isAgentEntry()),
  )
  const toggleLabel = () => {
    const e = entry()
    if (hasChildren()) {
      const n = childCount()
      return expanded()
        ? `▾ hide ${n} command${n === 1 ? "" : "s"}`
        : `▸ show ${n} command${n === 1 ? "" : "s"}`
    }
    const what =
      e.bodyLabel === "listing" ? "listing"
      : e.bodyLabel === "file" ? "file"
      : e.bodyLabel === "matches" ? "matches"
      : e.bodyLabel ?? "details"
    return `${expanded() ? "▾ hide" : "▸ show"} ${what}`
  }
  const headerDisclosure = () => {
    if (isAgentEntry()) return expanded() ? ("▾" as const) : ("▸" as const)
    if (hasChildren()) return expanded() ? ("▾" as const) : ("▸" as const)
    if (isThink() && hasThinkBody()) return expanded() ? ("▾" as const) : ("▸" as const)
    if (hasDiff() && entry().diff?.body?.trim()) return expanded() ? ("▾" as const) : ("▸" as const)
    if (hasToolBody()) return expanded() ? ("▾" as const) : ("▸" as const)
    return "" as const
  }
  const headerToggleable = () =>
    isAgentEntry()
    || hasChildren()
    || (isThink() && hasThinkBody())
    || (hasDiff() && !!entry().diff?.body?.trim())
    || hasToolBody()
  const headerGlyph = () => (isChatProse() || isThink() ? "" : entry().glyph)

  const padLeft = () => spineOuterPadding(props.layout)

  const nodeSummary = () => {
    if (isChatProse()) return ""
    return entry().summary
  }

  let suppressNextFocusMouseUp = false
  let lastToggleAt = 0

  function releaseFocusSuppression() {
    queueMicrotask(() => {
      suppressNextFocusMouseUp = false
    })
  }

  const handleFocus = () => {
    if (suppressNextFocusMouseUp) {
      releaseFocusSuppression()
      return
    }
    props.onFocus?.()
  }

  const handleHover = () => {
    if (suppressNextFocusMouseUp) return
    props.onHover?.()
  }

  const handleToggle = (event?: Pick<MouseEvent, "stopPropagation" | "preventDefault">) => {
    event?.stopPropagation?.()
    event?.preventDefault?.()
    const now = Date.now()
    if (now - lastToggleAt < 120) return
    lastToggleAt = now
    suppressNextFocusMouseUp = true
    props.onFocus?.()
    if (props.onToggle) props.onToggle()
    else setLocalExpanded((value) => !value)
    releaseFocusSuppression()
  }

  const handleHeaderMouseDown = (event: MouseEvent) => {
    if (!headerToggleable()) return
    if (event.button !== MouseButton.RIGHT) return
    handleToggle(event)
  }

  const handleHeaderMouseUp = (event: MouseEvent) => {
    if (!headerToggleable()) return
    if (event.button !== undefined && event.button !== MouseButton.LEFT) return
    handleToggle(event)
  }

  return (
    <Show when={!entry().hidden}>
      <box
        ref={props.nodeRef}
        flexDirection="row"
        flexShrink={0}
        width="100%"
        paddingLeft={padLeft()}
        onMouseOver={handleHover}
        onMouseDown={handleFocus}
        onMouseUp={handleFocus}
      >
        <SpineGutter
          index={props.index ?? entry().index}
          layout={props.layout}
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
              backgroundColor={props.focused ? (t.backgroundElement as any) : undefined}
              border={props.focused && !isChatProse() ? (["left"] as any) : undefined}
              borderColor={props.focused && !isChatProse() ? (t.accent as any) : undefined}
              onMouseDown={headerToggleable() ? handleHeaderMouseDown : undefined}
              onMouseUp={headerToggleable() ? handleHeaderMouseUp : undefined}
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
                disclosure={headerDisclosure()}
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
                    <SpineReport report={r()} expanded={expanded()} focused={props.focused} />
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

          <Show when={showToggleRow()}>
            <box flexDirection="row" flexShrink={0}>
              <SpineRail layout={props.layout} active={props.focused} />
              <text
                fg={(props.focused ? t.text : t.spineDiffMuted) as any}
                onMouseUp={handleToggle}
              >
                {toggleLabel()}
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
                backgroundColor={openBtnHover() ? (t.backgroundElement as any) : undefined}
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
                <text fg={(t.spineContext ?? t.textMuted) as any}>{entry().receipt!.command}</text>
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
                <SpineListing
                  entries={entry().listing!}
                  note={entry().bodyNote}
                  focused={props.focused}
                />
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
                <Show when={child != null} fallback={<text>…</text>}>
                <box flexDirection="column" flexShrink={0} minWidth={0}>
                  <box flexDirection="row" flexShrink={0} alignItems="flex-start">
                    <SpineRail
                      layout={props.layout}
                      glyph={i() === 0 ? "┌" : i() === childCount() - 1 ? "└" : "├"}
                      active={false}
                    />
                    <box flexDirection="column" flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
                      <text fg={(t.text ?? t.spineContext) as any} wrapMode="word">
                        {child.summary || child.receipt?.command || child.label || "action"}
                      </text>
                      <Show when={child.receipt?.summary || child.elapsed}>
                        <text fg={(t.spineDiffMuted ?? t.textMuted) as any} wrapMode="word">
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
