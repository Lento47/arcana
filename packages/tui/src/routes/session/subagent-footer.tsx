import { createMemo, createSignal, For, Show } from "solid-js"
import { useRouteData } from "../../context/route"
import { useSync } from "../../context/sync"
import { useTheme } from "../../context/theme"
import { SplitBorder } from "../../ui/border"
import type { AssistantMessage } from "@arcana/sdk/v2"
import { Lexicon, Glyph, AgentSigil } from "../../branding"
import { Locale } from "../../util/locale"
import { useTerminalDimensions } from "@opentui/solid"
import { useCommandShortcut, useOpencodeKeymap } from "../../keymap"
import { Scramble } from "../../component/scramble"

export function SubagentFooter() {
  const route = useRouteData("session")
  const sync = useSync()
  const messages = createMemo(() => sync.data.message[route.sessionID] ?? [])
  const session = createMemo(() => sync.session.get(route.sessionID))

  const subagentInfo = createMemo(() => {
    const s = session()
    if (!s) return { label: "Subagent", index: 0, total: 0 }
    const agentMatch = s.title.match(/@(\w+) subagent/)
    const label = agentMatch ? Locale.titlecase(agentMatch[1]) : "Subagent"
    if (!s.parentID) return { label, index: 0, total: 0 }
    const siblings = sync.data.session
      .filter((x) => x.parentID === s.parentID)
      .toSorted((a, b) => a.time.created - b.time.created)
    const index = siblings.findIndex((x) => x.id === s.id)
    return { label, index: index + 1, total: siblings.length }
  })

  const status = createMemo(() => {
    const s = session()
    if (!s) return { icon: "", color: "textMuted" as const, label: "" }
    const msg = messages()
    if (!msg.length) return { icon: "⏳", color: "textMuted" as const, label: "pending" }
    const last = msg[msg.length - 1]
    if (!last) return { icon: "⏳", color: "textMuted" as const, label: "pending" }
    if (last.role === "assistant" && (last as AssistantMessage).tokens?.output > 0) {
      return { icon: "✅", color: "success" as const, label: "done" }
    }
    return { icon: "⛧", color: "accent" as const, label: "running" }
  })

  const tailMessages = createMemo(() => messages().slice(-3))

  const usage = createMemo(() => {
    const msg = messages()
    const last = msg.findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) return
    const tokens = last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    if (tokens <= 0) return
    const model = sync.data.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const pct = model?.limit.context ? `${Math.round((tokens / model.limit.context) * 100)}%` : undefined
    const cost = session()?.cost ?? 0
    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    return { context: pct ? `${Locale.number(tokens)} (${pct})` : Locale.number(tokens), cost: cost > 0 ? money.format(cost) : undefined }
  })

  const [revealedErrors, setRevealedErrors] = createSignal(new Set<string>())
  const { theme } = useTheme()
  const keymap = useOpencodeKeymap()
  const parentShortcut = useCommandShortcut("session.parent")
  const previousShortcut = useCommandShortcut("session.child.previous")
  const nextShortcut = useCommandShortcut("session.child.next")
  const [hover, setHover] = createSignal<"parent" | "prev" | "next" | "self" | null>(null)
  useTerminalDimensions()

  return (
    <box flexShrink={0}>
      <box
        paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={1}
        {...SplitBorder} border={["left"]} borderColor={theme.border} flexShrink={0}
        backgroundColor={theme.backgroundPanel}
      >
        <box flexDirection="row" justifyContent="space-between" gap={1}>
          <box flexDirection="row" gap={1}>
            <box
              onMouseOver={() => setHover("self")} onMouseOut={() => setHover(null)}
              onMouseUp={() => keymap.dispatchCommand("session.parent")}
            >
              <text fg={theme.text}>
                <span style={{ fg: theme.textMuted }}>{AgentSigil.subagent}</span>{" "}
                <b>{subagentInfo().label}</b>
                <span style={{ fg: theme[status().color] }}>
                  {" "}{status().icon}
                </span>
              </text>
            </box>
            <Show when={subagentInfo().total > 0}>
              <text style={{ fg: theme.textMuted }}>
                {subagentInfo().index}/{subagentInfo().total} {Lexicon.Agent.school}
              </text>
            </Show>
            <Show when={usage()}>
              {(item) => (
                <text fg={theme.textMuted} wrapMode="none">
                  {[item().context, item().cost].filter(Boolean).join(` ${Glyph.sep} `)}
                </text>
              )}
            </Show>
          </box>
          <box flexDirection="row" gap={2}>
            <box onMouseOver={() => setHover("parent")} onMouseOut={() => setHover(null)} onMouseUp={() => keymap.dispatchCommand("session.parent")}
              backgroundColor={hover() === "parent" ? theme.backgroundElement : theme.backgroundPanel}>
              <text fg={theme.text}>Parent <span style={{ fg: theme.textMuted }}>{parentShortcut()}</span></text>
            </box>
            <box onMouseOver={() => setHover("prev")} onMouseOut={() => setHover(null)} onMouseUp={() => keymap.dispatchCommand("session.child.previous")}
              backgroundColor={hover() === "prev" ? theme.backgroundElement : theme.backgroundPanel}>
              <text fg={theme.text}>Prev <span style={{ fg: theme.textMuted }}>{previousShortcut()}</span></text>
            </box>
            <box onMouseOver={() => setHover("next")} onMouseOut={() => setHover(null)} onMouseUp={() => keymap.dispatchCommand("session.child.next")}
              backgroundColor={hover() === "next" ? theme.backgroundElement : theme.backgroundPanel}>
              <text fg={theme.text}>Next <span style={{ fg: theme.textMuted }}>{nextShortcut()}</span></text>
            </box>
          </box>
        </box>
        <Show when={status().label !== "" && hover() === "self" && tailMessages().length > 0}>
          <scrollbox maxHeight={3} flexShrink={0}>
            <For each={tailMessages()}>
              {(m, idx) => {
                const text = (m as any).role === "tool" ? `${Glyph.chevron} ${(m as any).toolName ?? "tool"}` : `${(m as any).content ?? ""}`
                const isError = text.toLowerCase().includes("error") || text.toLowerCase().includes("fail") || text.toLowerCase().includes("exception")
                const id = `err-${idx()}`
                return (
                  <Show when={isError} fallback={<text fg={theme.textMuted} wrapMode="none" truncate>{text}</text>}>
                    <Show when={revealedErrors().has(id)} fallback={
                      <box onMouseUp={() => setRevealedErrors(prev => new Set([...prev, id]))}>
                        <text fg={theme.error} wrapMode="none" truncate>
                          {Glyph.sigil} error (click)
                        </text>
                      </box>
                    }>
                      <Scramble error text={text} fg={theme.error} />
                    </Show>
                  </Show>
                )
              }}
            </For>
          </scrollbox>
        </Show>
      </box>
    </box>
  )
}
