import { createMemo, createSignal, For, Show } from "solid-js"
import { useRenderer } from "@opentui/solid"
import { useRouteData } from "../../context/route"
import { useSync } from "../../context/sync"
import { useTheme } from "../../context/theme"
import type { AssistantMessage } from "@arcana/sdk/v2"
import { Locale } from "../../util/locale"
import { contextUsageFor, hasContextUsage } from "../../util/context-pressure"
import { fitSegments, rendererWidth } from "../../util/geometry"
import { useTerminalSize } from "../../util/terminal-size"
import { useCommandShortcut, useOpencodeKeymap } from "../../keymap"

/**
 * Columns the identity group keeps when the row has to give ground — `mesh` and
 * the beginning of the agent's name, which is the part that makes two subagents
 * telling apart possible at all. With `minWidth={0}` the group was one of five
 * flexible segments and the deficit was shared among them evenly, so the group
 * that answers "which agent is this" lost letters while `· ctx 45.0K / 23%`
 * kept its columns: at 80 columns the footer read `mesGild◎`.
 *
 * It is also what the width budget reserves for the group, so the segments
 * beside it are measured against a floor rather than a name that happens to be
 * short today.
 */
const IDENTITY_MIN = 11

/** Row chrome: the outer box's `paddingLeft` 2 + `paddingRight` 1. */
const ROW_PADDING = 3
/** Also the column between every segment, so a measurement and the layout agree. */
const GAP = 1

const ACTIONS = [
  { name: "parent", label: "parent", command: "session.parent" },
  { name: "prev", label: "prev", command: "session.child.previous" },
  { name: "next", label: "next", command: "session.child.next" },
] as const

type ActionName = (typeof ACTIONS)[number]["name"]
/** The row's droppable segments, left to right. The identity is not one. */
type SegmentKey = "run" | "status" | "usage" | "actions"

function compactTailText(message: unknown) {
  const item = message as { role?: string; toolName?: string; content?: string }
  const raw = item.role === "tool" ? `tool ${item.toolName ?? "call"}` : `${item.content ?? ""}`
  return raw.replace(/\s+/g, " ").trim()
}

/** The context run exactly as it is drawn — measured and rendered from one string. */
function usageText(item: { context: string; pressure?: string; cost?: string }): string {
  return `· ctx ${item.context}${item.pressure ? ` · ${item.pressure}` : ""}${item.cost ? ` · ${item.cost}` : ""}`
}

export function SubagentFooter() {
  const route = useRouteData("session")
  const sync = useSync()
  const messages = createMemo(() => sync.data.message[route.sessionID] ?? [])
  const session = createMemo(() => sync.session.get(route.sessionID))

  const subagentInfo = createMemo(() => {
    const s = session()
    if (!s) return { label: "agent", index: 0, total: 0 }
    const agentMatch = s.title.match(/@(\w+) subagent/)
    const label = agentMatch ? Locale.titlecase(agentMatch[1]) : "agent"
    if (!s.parentID) return { label, index: 0, total: 0 }
    const siblings = sync.data.session
      .filter((x) => x.parentID === s.parentID)
      .toSorted((a, b) => a.time.created - b.time.created)
    const index = siblings.findIndex((x) => x.id === s.id)
    return { label, index: index + 1, total: siblings.length }
  })

  const status = createMemo(() => {
    const s = session()
    if (!s) return { glyph: "○", tone: "muted" as const, label: "pending" }
    const msg = messages()
    if (!msg.length) return { glyph: "○", tone: "muted" as const, label: "pending" }
    const last = msg[msg.length - 1]
    if (last?.role === "assistant" && (last as AssistantMessage).tokens?.output > 0) {
      return { glyph: "◎", tone: "ok" as const, label: "done" }
    }
    return { glyph: "◇", tone: "run" as const, label: "running" }
  })

  const tailMessages = createMemo(() => messages().slice(-3).map(compactTailText).filter(Boolean))

  const usage = createMemo(() => {
    const msg = messages()
    const last = msg.findLast(
      (item): item is AssistantMessage => item.role === "assistant" && hasContextUsage(item.tokens),
    )
    if (!last) return
    const model = sync.data.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const snapshot = contextUsageFor({
      tokens: last.tokens,
      limit: model?.limit,
      compaction: sync.data.config.compaction,
    })
    if (snapshot.tokens <= 0) return
    const cost = session()?.cost ?? 0
    return {
      context:
        snapshot.percent !== null
          ? `${Locale.number(snapshot.tokens)} / ${snapshot.percent}%`
          : Locale.number(snapshot.tokens),
      pressure: snapshot.pressure,
      cost: cost > 0 ? Locale.currency(cost) : undefined,
      urgent: snapshot.pressure === "compact now",
    }
  })

  const { theme } = useTheme()
  const t = theme as Record<string, unknown>
  const keymap = useOpencodeKeymap()
  const shortcuts: Record<ActionName, () => string> = {
    parent: useCommandShortcut("session.parent"),
    prev: useCommandShortcut("session.child.previous"),
    next: useCommandShortcut("session.child.next"),
  }
  const [hoverZone, setHoverZone] = createSignal<ActionName | null>(null)
  const [hover, setHover] = createSignal(false)

  const statusColor = () => {
    if (status().tone === "ok") return (t.spineOk ?? theme.success) as any
    if (status().tone === "run") return (t.spineRun ?? theme.accent) as any
    return (t.spineContext ?? theme.textMuted) as any
  }

  const actionBg = (name: ActionName) =>
    hoverZone() === name ? ((t.backgroundElement ?? theme.backgroundElement) as any) : undefined

  /**
   * The terminal, watched rather than sampled once: a footer still laid out for
   * the width it was mounted at either clips a resize away or hides segments a
   * wider terminal had room for. `rendererWidth` returns undefined until the
   * renderer has been laid out, which is why every consumer below treats an
   * unmeasured width as "keep everything" instead of "keep nothing".
   *
   * The watch is the app's shared one, so this footer adds no subscription of
   * its own to a renderer that already carries one per surface.
   */
  const renderer = useRenderer()
  const size = useTerminalSize(renderer)
  const termWidth = () => rendererWidth({ width: size().width })

  /** Two columns of padding around a label, plus the space and the shortcut. */
  const chipWidth = (label: string, shortcut: string) =>
    Locale.displayWidth(label) + 2 + (shortcut.length > 0 ? GAP + Locale.displayWidth(shortcut) : 0)

  const actionsWidth = createMemo(() =>
    ACTIONS.reduce(
      (sum, action, index) => sum + chipWidth(action.label, shortcuts[action.name]()) + (index > 0 ? GAP : 0),
      0,
    ),
  )

  /**
   * The row's segments in the order they are drawn, which is also the order they
   * are given up in: `run`, `status`, the context run, then the action chips.
   * The chips go last and go whole — at 60 columns a terminal is being read for
   * state, and the chips advertise shortcuts that the keyboard dispatch reaches
   * without them, while `· ctx 45.0K / 23%` has no other home in this shell.
   */
  const segments = createMemo(() => {
    const items: Array<{ key: SegmentKey; width: number }> = []
    const info = subagentInfo()
    if (info.total > 0) {
      items.push({ key: "run", width: Locale.displayWidth(`· run ${info.index}/${info.total}`) })
    }
    items.push({ key: "status", width: Locale.displayWidth(`· ${status().label}`) })
    const used = usage()
    if (used) items.push({ key: "usage", width: Locale.displayWidth(usageText(used)) })
    items.push({ key: "actions", width: actionsWidth() })
    return items
  })

  /** What the identity group actually occupies: `mesh`, the name, the glyph. */
  const identityWidth = createMemo(() => {
    const info = subagentInfo()
    return Math.max(IDENTITY_MIN, Locale.displayWidth(`mesh ${info.label} ${status().glyph}`))
  })

  const shows = (key: SegmentKey) => {
    const width = termWidth()
    const all = segments()
    if (width === undefined) return true
    // Reserved at its real width, not at the floor: reserving 11 while the
    // group occupies 13 left the row one column over at 80 and yoga shrank the
    // group, which loses the literal spaces rather than the last letter
    // (`meshGilded◎`).
    const kept = fitSegments(width - ROW_PADDING - identityWidth(), all.map((item) => item.width), GAP)
    return all.slice(0, kept).some((item) => item.key === key)
  }

  function Action(props: { name: ActionName; label: string; command: string }) {
    return (
      <box
        flexDirection="row"
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={actionBg(props.name)}
        onMouseOver={() => setHoverZone(props.name)}
        onMouseOut={() => setHoverZone(null)}
        onMouseUp={() => keymap.dispatchCommand(props.command)}
      >
        <text wrapMode="none" fg={(t.spineBrand ?? theme.text) as any}>
          {props.label}
        </text>
        <Show when={shortcuts[props.name]()}>
          <text wrapMode="none" fg={(t.spineContext ?? theme.textMuted) as any}> {shortcuts[props.name]()}</text>
        </Show>
      </box>
    )
  }
  return (
    <box flexDirection="column" flexShrink={0} paddingLeft={2} paddingRight={1}>
      {/* No top border: the composer frame directly below (and the transcript
          above) already draw the separation; a second rule cost a row. */}
      {/*
        One content row, and only one, at every width.

        Two defects lived in this row. The `mesh` group and each `Action` were
        column boxes — OpenTUI's default — so the three spans inside them stacked
        and the footer drew four rows (`mesh` / ` Gilded` / ` ◎` / the rest)
        instead of the one line it reads as.

        The second was what happened once it did fit on one row but not in the
        columns available. Yoga shares a deficit among every shrinkable child, so
        the identity group lost letters while the telemetry kept its own
        (`mesGild◎`, then `· ctx 45.0...3%`); with the row too narrow to hold
        anything, the segments painted over each other and over the chips
        (`/ 2parent0.04prev`). Segments are therefore whole or absent — chosen by
        `fitSegments` — and the row clips at its right edge as a last resort.
      */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        gap={GAP}
        flexShrink={0}
        minHeight={1}
        overflow="hidden"
      >
        <box flexDirection="row" gap={GAP} minWidth={0} flexShrink={1}>
          <box
            flexDirection="row"
            flexShrink={1}
            minWidth={IDENTITY_MIN}
            onMouseOver={() => setHover(true)}
            onMouseOut={() => setHover(false)}
          >
            <text wrapMode="none" fg={(t.spineContext ?? theme.textMuted) as any}>mesh</text>
            <text wrapMode="none" fg={(t.spineBrand ?? theme.text) as any}> {subagentInfo().label}</text>
            <text wrapMode="none" fg={statusColor()}> {status().glyph}</text>
          </box>
          <Show when={shows("run")}>
            <text flexShrink={0} wrapMode="none" fg={(t.spineDiffMuted ?? theme.textMuted) as any}>
              · run {subagentInfo().index}/{subagentInfo().total}
            </text>
          </Show>
          <Show when={shows("status")}>
            <text flexShrink={0} wrapMode="none" fg={statusColor()}>· {status().label}</text>
          </Show>
          <Show when={shows("usage") ? usage() : undefined}>
            {(item) => (
              <text
                flexShrink={0}
                fg={(item().urgent ? t.spineFail : t.spineContext ?? theme.textMuted) as any}
                wrapMode="none"
              >
                {usageText(item())}
              </text>
            )}
          </Show>
        </box>
        <Show when={shows("actions")}>
          <box flexDirection="row" gap={GAP} flexShrink={0}>
            <For each={ACTIONS}>
              {(action) => <Action name={action.name} label={action.label} command={action.command} />}
            </For>
          </box>
        </Show>
      </box>
      <Show when={hover() && tailMessages().length > 0}>
        <scrollbox maxHeight={3} flexShrink={0} paddingLeft={1} scrollbarOptions={{ visible: false }}>
          <For each={tailMessages()}>
            {(text) => (
              <text
                fg={text.toLowerCase().match(/error|fail|exception/) ? ((t.spineFail ?? theme.error) as any) : ((t.spineContext ?? theme.textMuted) as any)}
                wrapMode="none"
                truncate
              >
                │ {text}
              </text>
            )}
          </For>
        </scrollbox>
      </Show>
    </box>
  )
}
