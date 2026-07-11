import { MouseButton, type BoxRenderable, type MouseEvent } from "@opentui/core"
import { For, Show, createMemo, createSignal } from "solid-js"
import type { SpineEntry as SpineEntryType, SpineLayout } from "./spine-types"
import { spineOuterPadding } from "./spine-types"
import { useTheme } from "../../context/theme"
import { SpineGutter } from "./spine-gutter"
import { SpineNode } from "./spine-node"
import { SpineReceipt } from "./spine-receipt"
import { SpineDiff } from "./spine-diff"
import { SpineRail } from "./spine-rail"
import { SpineProse, joinSpineProse } from "./spine-prose"
import { SpineReport } from "./spine-report"
import { SpineListArtifact } from "./spine-list-artifact"


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
  nodeRef?: (node: BoxRenderable | undefined) => void
}) {
  const e = props.entry
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  if (e.hidden) return null

  const isWide = props.layout === "wide"
  const [localExpanded, setLocalExpanded] = createSignal(e.expandedByDefault ?? !e.collapsible)
  const expanded = () => props.expanded ?? localExpanded()
  const isChatProse = e.kind === "ask" || e.kind === "plan" || e.kind === "ok"
  const isThink = e.kind === "think"
  const proseText = createMemo(() => joinSpineProse(e.summary, e.body))
  const hasProse = createMemo(() => !!proseText().trim())
  const hasDiff = createMemo(() => !!e.diff)
  const hasToolBody = createMemo(() => !isChatProse && !isThink && !!e.body?.trim())
  const hasThinkBody = createMemo(() => isThink && !!e.body?.trim())
  const hasReceipt = createMemo(() => receiptHasContent(e))
  const canToggle = createMemo(() => !!props.onToggle || isThink || hasDiff())
  const bodyExpanded = () => (isChatProse ? true : expanded())

  // Tools keep an explicit toggle row. Think/diff use an inline chevron on the header.
  const showToggleRow = createMemo(() => canToggle() && !isThink && !hasDiff() && hasToolBody())
  const toggleLabel = () => `${expanded() ? "▾ hide" : "▸ show"} ${e.bodyLabel ?? "details"}`
  const headerDisclosure = () => {
    if (isThink && hasThinkBody()) return expanded() ? ("▾" as const) : ("▸" as const)
    if (hasDiff() && e.diff?.body?.trim()) return expanded() ? ("▾" as const) : ("▸" as const)
    return "" as const
  }
  const headerToggleable = () =>
    (isThink && hasThinkBody()) || (hasDiff() && !!e.diff?.body?.trim())

  const padLeft = spineOuterPadding(props.layout)

  const nodeSummary = () => {
    if (isChatProse) return ""
    return e.summary
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

  return (
    <box
      ref={props.nodeRef}
      flexDirection="row"
      flexShrink={0}
      width="100%"
      paddingLeft={padLeft}
      onMouseOver={handleHover}
      onMouseDown={handleFocus}
      onMouseUp={handleFocus}
    >
      <SpineGutter
        index={props.index ?? e.index}
        elapsed={e.elapsed}
        timestamp={e.timestamp}
        layout={props.layout}
        active={props.focused}
      />
      <box flexDirection="column" flexGrow={1} minWidth={0} flexShrink={1}>
        <box
          flexDirection="row"
          flexShrink={0}
          alignItems="flex-start"
          backgroundColor={props.focused ? (t.backgroundElement as any) : undefined}
          onMouseDown={headerToggleable() ? handleHeaderMouseDown : undefined}
        >
          <SpineRail layout={props.layout} kind={e.kind} glyph={e.glyph} active={props.focused} />
          <SpineNode
            kind={e.kind}
            label={e.label}
            summary={nodeSummary()}
            actor={e.actor}
            layout={props.layout}
            focused={props.focused}
            disclosure={headerDisclosure()}
            streaming={e.streaming}
            thinking={e.thinking}
          />
        </box>

        {/* Chat prose — always visible markdown */}
        <Show when={isChatProse && hasProse()}>
          <box flexDirection="row" flexShrink={0} alignItems="flex-start">
            <SpineRail layout={props.layout} active={props.focused} />
            <box flexGrow={1} minWidth={0} flexShrink={1}>
              <SpineProse
                kind={e.kind}
                text={proseText()}
                bodyLabel={e.bodyLabel}
                hint={e.summary}
                streaming={true}
                focused={props.focused}
                reminders={e.reminders}
              />
            </box>
          </box>
        </Show>

        {/* Report body — scorecard + concern callouts, always visible when expanded */}
        <Show when={e.kind === "report" && e.report}>
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
              <SpineReceipt kind={e.kind} receipt={e.receipt!} layout={props.layout} />
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

        {/* Thinking body — full reasoning when expanded (click header / space / enter) */}
        <Show when={isThink && hasThinkBody() && bodyExpanded()}>
          <box flexDirection="row" flexShrink={0} alignItems="flex-start">
            <SpineRail layout={props.layout} active={props.focused} />
            <box flexGrow={1} minWidth={0} flexShrink={1}>
              <SpineProse
                kind="think"
                text={e.body!}
                bodyLabel="reasoning"
                streaming={true}
                focused={props.focused}
                reminders={e.reminders}
              />
            </box>
          </box>
        </Show>

        {/* Incantation row — compact command text before output */}
        <Show when={(e.kind === "run" || e.kind === "inspect") && e.receipt?.command && bodyExpanded()}>
          <box flexDirection="row" flexShrink={0} alignItems="flex-start">
            <SpineRail layout={props.layout} active={props.focused} />
            <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
              <text fg={(t.spineContext ?? t.textMuted) as any}>{e.receipt!.command}</text>
            </box>
          </box>
        </Show>

        {/* Table artifact — stacked key/value rows instead of raw CLI table */}
        <Show when={e.table && bodyExpanded()}>
          <box flexDirection="row" flexShrink={0} alignItems="flex-start">
            <SpineRail layout={props.layout} active={props.focused} />
            <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
              <SpineListArtifact
                headers={e.table!.headers}
                rows={e.table!.rows}
                focused={props.focused}
              />
            </box>
          </box>
        </Show>

        <Show when={hasToolBody() && bodyExpanded() && !e.table}>
          <box flexDirection="row" flexShrink={0} alignItems="flex-start">
            <SpineRail layout={props.layout} active={props.focused} />
            <box flexGrow={1} minWidth={0} flexShrink={1} paddingLeft={1}>
              <SpineProse
                kind={e.kind}
                text={e.body!}
                bodyLabel={e.bodyLabel}
                hint={e.summary}
                streaming={false}
                focused={props.focused}
                reminders={e.reminders}
              />
            </box>
          </box>
        </Show>

        <Show when={e.diff}>
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

        <Show when={isWide}>
          <box flexDirection="row" height={1} flexShrink={0}>
            <SpineRail layout={props.layout} active={props.focused} />
            <box flexGrow={1} minWidth={0} />
          </box>
        </Show>

        <Show when={e.children && expanded()}>
          <For each={e.children!}>
            {(child) => (
              <box flexDirection="row" flexShrink={0} paddingLeft={2}>
                <SpineRail layout={props.layout} kind={child.kind} glyph={child.glyph} active={false} />
                <box flexGrow={1} minWidth={0}>
                  <text fg={t.spineDiffMuted as any}>
                    {child.receipt?.summary || child.receipt?.label || ""} · {child.elapsed}
                  </text>
                </box>
              </box>
            )}
          </For>
        </Show>
      </box>
    </box>
  )
}
