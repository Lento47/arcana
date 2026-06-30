import type { AssistantMessage } from "@arcana/sdk/v2"
import type { TuiPlugin, TuiPluginApi } from "@arcana/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { Locale } from "../../util/locale"
import { Lexicon, Glyph } from "../../branding"
import { selectedForeground, useTheme } from "../../context/theme"
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"

const id = "internal:statusbar"

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

function renderBar(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct))
  const filled = Math.round(clamped / 10)
  const empty = 10 - filled
  return "▰".repeat(Math.max(0, filled)) + "▱".repeat(Math.max(0, empty))
}

function clampPercent(pct: number): number {
  return Math.max(0, Math.min(100, pct))
}

function compactModelName(value: string): string {
  return value.length > 34 ? `${value.slice(0, 31)}...` : value
}

// Minimal session metrics, rendered in the global app_bottom slot. Off-session
// (home) it renders nothing. No sidebar — this thin line is the only metrics surface.
function View(props: { api: TuiPluginApi }) {
  const api = props.api
  const theme = () => api.theme.current

  const sessionID = createMemo(() => {
    const route = api.route.current
    if (route.name !== "session") return undefined
    return (route.params as { sessionID?: string } | undefined)?.sessionID
  })

  const sessionMessages = createMemo(() => {
    const sid = sessionID()
    return sid ? api.state.session.messages(sid) : []
  })

  const latestAssistant = createMemo(() => {
    return sessionMessages().findLast((item): item is AssistantMessage => item.role === "assistant")
  })

  const latestUsageAssistant = createMemo(() => {
    return sessionMessages().findLast(
      (item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0,
    )
  })

  const model = createMemo(() => {
    const last = latestAssistant()
    if (!last) return undefined
    const provider = api.state.provider.find((item) => item.id === last.providerID)
    return compactModelName(provider?.models[last.modelID]?.name ?? last.modelID)
  })

  const usage = createMemo(() => {
    const last = latestUsageAssistant()
    if (!last) return undefined
    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const limit = api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]?.limit.context
    return { tokens, percent: limit ? clampPercent(Math.round((tokens / limit) * 100)) : null }
  })

  const cost = createMemo(() => {
    const sid = sessionID()
    if (!sid) return undefined
    return api.state.session.get(sid)?.cost
  })

  const mlRuntime = createMemo(() => Boolean(api.kv.get("ml_runtime_enabled", false)))

  const status = createMemo(() => {
    const sid = sessionID()
    if (!sid) return undefined
    return api.state.session.status(sid)
  })
  const busy = createMemo(() => status()?.type === "busy")
  const compacting = createMemo(() => {
    const sid = sessionID()
    if (!sid) return false
    return api.state.session.compacting(sid)
  })

  const contextPressure = createMemo(() => {
    const pct = usage()?.percent
    if (pct === null || pct === undefined || compacting()) return undefined
    if (pct >= 95) return { label: "COMPACT NOW", color: theme().error }
    if (pct >= 80) return { label: "COMPACT SOON", color: theme().warning }
    return undefined
  })

  // Abstract diamond "charge" — pulses ◇→◈→◆→◈ only while the model generates.
  const PULSE = ["◇", "◈", "◆", "◈"]
  const [frame, setFrame] = createSignal(0)
  createEffect(() => {
    if (!busy()) {
      setFrame(0)
      return
    }
    const timer = setInterval(() => setFrame((f) => (f + 1) % PULSE.length), 140)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <Show when={sessionID() && (busy() || compacting() || model() || usage())}>
      <box
        width="100%"
        flexDirection="row"
        flexShrink={0}
        alignItems="center"
        gap={2}
        paddingLeft={2}
        paddingRight={2}
        backgroundColor={theme().background}
        border={["top"]}
        borderColor={theme().borderSubtle}
      >
        <Show when={busy()}>
          <text fg={theme().accent}>{PULSE[frame()]}</text>
        </Show>
        <Show when={compacting()}>
          <box backgroundColor={theme().warning} paddingLeft={1} paddingRight={1}>
            <text fg={selectedForeground(theme(), theme().warning)}>
              <span style={{ fg: selectedForeground(theme(), theme().warning), bold: true }}>⟳ COMPACT</span>
            </text>
          </box>
        </Show>
        <Show when={contextPressure()}>
          {(pressure) => (
            <box backgroundColor={pressure().color} paddingLeft={1} paddingRight={1}>
              <text fg={selectedForeground(theme(), pressure().color)}>
                <span style={{ fg: selectedForeground(theme(), pressure().color), bold: true }}>
                  {pressure().label}
                </span>
              </text>
            </box>
          )}
        </Show>
        <Show when={status()?.type === "retry"}>
          <text fg={theme().warning}>↻ retry</text>
        </Show>
        <Show when={model()}>
          {(value) => (
            <text fg={theme().textMuted}>
              {Glyph.sigil} {value()}
            </text>
          )}
        </Show>
        <Show when={mlRuntime()}>
          <text fg={theme().primary}>
            <span style={{ fg: theme().primary, bold: true }}>ML</span>
          </text>
        </Show>
        <Show when={usage()}>
          {(u) => (
            <Show when={u().percent !== null}>
              <text fg={theme().textMuted}>|</text>
              <text fg={theme().primary}>
                <span
                  style={{
                    fg: u().percent! > 95 ? theme().error : u().percent! > 80 ? theme().warning : theme().primary,
                  }}
                >
                  {renderBar(u().percent!)}
                </span>
              </text>
            </Show>
          )}
        </Show>
        <box flexGrow={1} minHeight={0} />
        <Show when={usage()}>
          {(value) => (
            <text fg={theme().textMuted}>
              <span style={{ fg: theme().primary }}>{Locale.number(value().tokens)}</span> {Lexicon.Token.label}
              <Show when={value().percent !== null}>
                <span style={{ fg: theme().secondary }}>
                  {Glyph.meter} {value().percent + "%"}
                </span>
              </Show>
            </text>
          )}
        </Show>
        <Show when={cost() !== undefined && cost()! > 0}>
          <text fg={theme().textMuted}>
            {Glyph.diamond} {money.format(cost()!)}
          </text>
        </Show>
      </box>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 50,
    slots: {
      app_bottom() {
        return <View api={api} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
