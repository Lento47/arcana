import type { AssistantMessage } from "@arcana/sdk/v2"
import type { TuiPlugin, TuiPluginApi } from "@arcana/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { Locale } from "../../util/locale"
import { COMPACT_NOW_PERCENT, COMPACT_SOON_PERCENT, contextPressure as pressureFromPercent } from "../../util/context-pressure"
import { Lexicon, Glyph } from "../../branding"
import { ShimmerText } from "../../component/shimmer-text"
import { selectedForeground } from "../../context/theme"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"

const id = "internal:statusbar"

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

interface BarSegment { filled: boolean }

function renderBar(pct: number): BarSegment[] {
  const clamped = Math.max(0, Math.min(100, pct))
  const filled = Math.round(clamped / 10)
  const empty = 10 - filled
  const segments: BarSegment[] = []
  for (let i = 0; i < Math.max(0, filled); i++) segments.push({ filled: true })
  for (let i = 0; i < Math.max(0, empty); i++) segments.push({ filled: false })
  return segments
}

function clampPercent(pct: number): number {
  return Math.max(0, Math.min(100, pct))
}

/**
 * Compact model name for statusbar display. Preserves trailing date suffix
 * (e.g. YYYYMMDD) so model versions remain distinguishable at a glance.
 */
function compactModelName(value: string): string {
  if (value.length <= 50) return value
  // Try to preserve a trailing date suffix: ...20260514
  const dateMatch = value.match(/[-_](\d{8}|\d{4}-\d{2}-\d{2})$/)
  if (dateMatch) {
    const suffix = dateMatch[0] // e.g. "-20260514"
    const prefixMax = 50 - suffix.length - 3 // 3 for "..."
    return value.slice(0, prefixMax) + "..." + suffix
  }
  return `${value.slice(0, 47)}...`
}

function tokenStateLabel(percent: number | null, compacting: boolean): string {
  if (compacting) return "compacting"
  if (percent === null) return "unbounded"
  if (percent >= COMPACT_NOW_PERCENT) return "critical"
  if (percent >= COMPACT_SOON_PERCENT) return "high"
  return "healthy"
}

// Minimal session metrics, rendered in the global app_bottom slot. Off-session
// (home) it renders nothing. No sidebar — this thin line is the only metrics surface.
function View(props: { api: TuiPluginApi }) {
  const api = props.api
  const theme = () => api.theme.current

  const shell = () => (api.tuiConfig as Record<string, unknown>).shell as string | undefined

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
    const label = pressureFromPercent(pct)
    if (label === "compact now") return { label: "COMPACT NOW", color: theme().error }
    if (label === "compact soon") return { label: "COMPACT SOON", color: theme().warning }
    return undefined
  })

  const busyVerb = createMemo(() => {
    if (compacting()) return "Compacting context…"
    if (!busy()) return ""
    return "Thinking…"
  })

  return (
    <Show when={sessionID() && (shell() === "command-spine" ? (compacting() || contextPressure()) : (busy() || compacting() || model() || usage()))}>
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
        <Show when={busyVerb()}>
          <ShimmerText text={busyVerb()} active={true} background={theme().background as any} />
        </Show>
        <Show when={compacting()}>
          <box backgroundColor={theme().warning} paddingLeft={1} paddingRight={1}>
            <text fg={selectedForeground(theme(), theme().warning)}>
              <span style={{ fg: selectedForeground(theme(), theme().warning), bold: true }}>
                ⟳ COMPACTING
              </span>
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
                <For each={renderBar(u().percent!)}>
                  {(seg) => {
                    const fillColor = u().percent! > 95 ? theme().error : u().percent! > 80 ? theme().warning : theme().primary
                    return <span style={{ fg: seg.filled ? fillColor : theme().textMuted }}>{seg.filled ? "▰" : "▱"}</span>
                  }}
                </For>
              </text>
            </Show>
          )}
        </Show>
        <box flexGrow={1} minHeight={0} />
        <Show when={usage()}>
          {(value) => (
            <text fg={theme().textMuted}>
              <span style={{ fg: theme().primary }}>CTX</span>{" "}
              <span style={{ fg: theme().primary }}>{Locale.number(value().tokens)}</span> {Lexicon.Token.label}
              <Show when={value().percent !== null}>
                <span style={{ fg: theme().secondary }}>
                  {Glyph.meter} {value().percent + "%"}
                </span>
              </Show>
              <span style={{ fg: compacting() ? theme().warning : theme().textMuted }}>
                {" "}
                {tokenStateLabel(value().percent, compacting())}
              </span>
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
