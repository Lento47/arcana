import { createMemo, createSignal, For, Show } from "solid-js"
import { useRouteData } from "../../context/route"
import { useSync } from "../../context/sync"
import { useTheme } from "../../context/theme"
import type { AssistantMessage } from "@arcana/sdk/v2"
import { Locale } from "../../util/locale"
import { useCommandShortcut, useOpencodeKeymap } from "../../keymap"

function clampPercent(pct: number): number {
  return Math.max(0, Math.min(100, pct))
}

function contextPressure(percent: number | undefined): "compact now" | "compact soon" | undefined {
  if (percent === undefined) return undefined
  if (percent >= 95) return "compact now"
  if (percent >= 80) return "compact soon"
  return undefined
}

function compactTailText(message: unknown) {
  const item = message as { role?: string; toolName?: string; content?: string }
  const raw = item.role === "tool" ? `tool ${item.toolName ?? "call"}` : `${item.content ?? ""}`
  return raw.replace(/\s+/g, " ").trim()
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
    const last = msg.findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) return
    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    if (tokens <= 0) return
    const model = sync.data.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const percent = model?.limit.context ? clampPercent(Math.round((tokens / model.limit.context) * 100)) : undefined
    const pressure = contextPressure(percent)
    const cost = session()?.cost ?? 0
    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    return {
      context: percent !== undefined ? `${Locale.number(tokens)} / ${percent}%` : Locale.number(tokens),
      pressure,
      cost: cost > 0 ? money.format(cost) : undefined,
      urgent: pressure === "compact now",
    }
  })

  const { theme } = useTheme()
  const t = theme as Record<string, unknown>
  const keymap = useOpencodeKeymap()
  const parentShortcut = useCommandShortcut("session.parent")
  const previousShortcut = useCommandShortcut("session.child.previous")
  const nextShortcut = useCommandShortcut("session.child.next")
  const [hover, setHover] = createSignal<"parent" | "prev" | "next" | "self" | null>(null)

  const statusColor = () => {
    if (status().tone === "ok") return (t.spineOk ?? theme.success) as any
    if (status().tone === "run") return (t.spineRun ?? theme.accent) as any
    return (t.spineContext ?? theme.textMuted) as any
  }

  const actionBg = (name: "parent" | "prev" | "next") =>
    hover() === name ? ((t.backgroundElement ?? theme.backgroundElement) as any) : undefined

  function Action(props: { name: "parent" | "prev" | "next"; label: string; shortcut: string; command: string }) {
    return (
      <box
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={actionBg(props.name)}
        onMouseOver={() => setHover(props.name)}
        onMouseOut={() => setHover(null)}
        onMouseUp={() => keymap.dispatchCommand(props.command)}
      >
        <text fg={(t.spineBrand ?? theme.text) as any}>{props.label}</text>
        <text fg={(t.spineContext ?? theme.textMuted) as any}> {props.shortcut}</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" flexShrink={0} paddingLeft={2} paddingRight={1}>
      <box border={["top"]} borderColor={(t.spineRail ?? theme.borderSubtle) as any} flexShrink={0} />
      <box flexDirection="row" justifyContent="space-between" gap={1} flexShrink={0} minHeight={1}>
        <box flexDirection="row" gap={1} minWidth={0} flexShrink={1}>
          <box
            onMouseOver={() => setHover("self")}
            onMouseOut={() => setHover(null)}
            onMouseUp={() => keymap.dispatchCommand("session.parent")}
          >
            <text fg={(t.spineContext ?? theme.textMuted) as any}>mesh</text>
            <text fg={(t.spineBrand ?? theme.text) as any}> {subagentInfo().label}</text>
            <text fg={statusColor()}> {status().glyph}</text>
          </box>
          <Show when={subagentInfo().total > 0}>
            <text fg={(t.spineDiffMuted ?? theme.textMuted) as any}>
              · run {subagentInfo().index}/{subagentInfo().total}
            </text>
          </Show>
          <text fg={statusColor()}>· {status().label}</text>
          <Show when={usage()}>
            {(item) => (
              <text fg={(item().urgent ? t.spineFail : t.spineContext ?? theme.textMuted) as any} wrapMode="none" truncate>
                · ctx {item().context}
                <Show when={item().pressure}> · {item().pressure}</Show>
                <Show when={item().cost}> · {item().cost}</Show>
              </text>
            )}
          </Show>
        </box>
        <box flexDirection="row" flexShrink={0}>
          <Action name="parent" label="parent" shortcut={parentShortcut()} command="session.parent" />
          <Action name="prev" label="prev" shortcut={previousShortcut()} command="session.child.previous" />
          <Action name="next" label="next" shortcut={nextShortcut()} command="session.child.next" />
        </box>
      </box>
      <Show when={hover() === "self" && tailMessages().length > 0}>
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