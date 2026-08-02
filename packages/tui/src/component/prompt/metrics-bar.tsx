/**
 * Session metrics bar — sticky, single-line, right-aligned status below the
 * input prompt. Renders cumulative session metrics:
 *
 *   ⌬ 4m 12s  ·  12.4k↓  3.1k↑  ·  $0.08  ·  compact soon
 *
 *   ⌬   elapsed since session.time.created (1Hz tick)
 *   ↓↑  cumulative input / output tokens
 *   $   session.cost (hidden when zero / free model)
 *   …   context pressure: "compact soon" (≥85%) or "compact now" (≥95%)
 *
 * Gated by tuiConfig.prompt.metrics_bar (default true). Returns null when
 * no session is active or the bar is disabled.
 *
 * Note: the top statusbar plugin already surfaces these same metrics in the
 * app_bottom slot — this bar is the per-prompt equivalent for shells where
 * the plugin isn't visible (e.g. the command spine).
 */
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { useTuiConfig } from "../../config"
import { Locale } from "../../util/locale"
import { formatDuration } from "../../util/format"
import { contextPressure } from "../../util/context-pressure"
import type { JSX } from "@opentui/solid"

function clampPercent(pct: number): number {
  return Math.max(0, Math.min(100, pct))
}

export function SessionMetricsBar(props: { sessionID?: string; freeUsage?: { state?: string; expiresAt?: string } | null }): JSX.Element {
  const { theme } = useTheme()
  const sync = useSync()
  const tuiConfig = useTuiConfig()

  const enabled = createMemo(() => tuiConfig.prompt?.metrics_bar !== false)

  // 1Hz tick for the elapsed clock. Skip the interval when the bar is hidden
  // or there's no session — no point burning cycles.
  const [tick, setTick] = createSignal(Date.now())
  onMount(() => {
    const id = setInterval(() => setTick(Date.now()), 1000)
    onCleanup(() => clearInterval(id))
  })

  const session = createMemo(() => {
    const sid = props.sessionID
    if (!sid) return undefined
    return sync.session.get(sid)
  })

  // Reference tick() so Solid doesn't optimize the elapsed memo out of the
  // dependency graph — the bar should re-render every second even if the
  // session object hasn't changed.
  const elapsed = createMemo(() => {
    const s = session()
    if (!s) return undefined
    tick()
    return Math.max(0, Math.floor((tick() - s.time.created) / 1000))
  })

  const tokens = createMemo(() => {
    const s = session()
    if (!s?.tokens) return undefined
    return s.tokens
  })

  // Context pressure uses the LAST assistant message's cumulative tokens
  // (matches the existing top statusbar + sidebar context plugins).
  const lastAssistant = createMemo(() => {
    const sid = props.sessionID
    if (!sid) return undefined
    const msgs = sync.data.message[sid] ?? []
    return msgs.findLast((m) => m.role === "assistant")
  })

  const percent = createMemo(() => {
    const last = lastAssistant() as { tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }; providerID?: string; modelID?: string } | undefined
    if (!last?.tokens) return undefined
    const total = last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    if (!total) return undefined
    const model = sync.data.provider.find((p) => p.id === last.providerID)?.models[last.modelID ?? ""]
    const limit = (model as { limit?: { context?: number } } | undefined)?.limit?.context
    if (!limit) return undefined
    return clampPercent(Math.round((total / limit) * 100))
  })

  const pressure = createMemo(() => contextPressure(percent()))

  // Free-tier remaining time from the proxy's /v1/free/usage snapshot.
  // Only show when the user is on the free tier (state: "active" or
  // "expired"), not when licensed or eligible. Updates when the parent
  // passes a new freeUsage prop.
  const freeRemaining = createMemo(() => {
    const f = props.freeUsage
    if (!f) return undefined
    if (f.state !== "active") return undefined
    if (!f.expiresAt) return undefined
    const ms = Date.parse(f.expiresAt)
    if (!Number.isFinite(ms)) return undefined
    const mins = Math.max(0, Math.round((ms - Date.now()) / 60_000))
    if (mins <= 0) return undefined
    return `${mins}m of 60m`
  })

  const showAny = createMemo(() => {
    if (!enabled()) return false
    if (!props.sessionID) return false
    return Boolean(session())
  })

  return (
    <Show when={showAny()}>
      <box
        width="100%"
        flexDirection="row"
        justifyContent="flex-end"
        alignItems="center"
        paddingLeft={2}
        paddingRight={2}
        paddingBottom={0}
        flexShrink={0}
      >
        <text fg={theme.textMuted}>
          <Show when={elapsed() !== undefined}>
            <span style={{ fg: theme.accent }}>⌬ </span>
            <span style={{ fg: theme.textMuted }}>{formatDuration(elapsed()!)}</span>
          </Show>
          <Show when={tokens()}>
            {(t) => (
              <>
                <span style={{ fg: theme.textMuted }}>  ·  </span>
                <span style={{ fg: theme.textMuted }}>{Locale.number(t().input)}</span>
                <span style={{ fg: theme.textMuted }}>↓ </span>
                <span style={{ fg: theme.textMuted }}>{Locale.number(t().output)}</span>
                <span style={{ fg: theme.textMuted }}>↑</span>
              </>
            )}
          </Show>
          <Show when={tokens()?.input || tokens()?.output || tokens()?.reasoning || tokens()?.cache.read || tokens()?.cache.write}>
            <span style={{ fg: theme.textMuted }}>  ·  </span>
            <span style={{ fg: theme.textMuted }}>{Locale.number(
              (tokens()?.input ?? 0) + (tokens()?.output ?? 0) + (tokens()?.reasoning ?? 0) +
              (tokens()?.cache.read ?? 0) + (tokens()?.cache.write ?? 0),
            )}</span>
            <span style={{ fg: theme.textMuted }}> total</span>
          </Show>
          <Show when={(session()?.cost ?? 0) > 0}>
            <span style={{ fg: theme.textMuted }}>  ·  </span>
            <span style={{ fg: theme.textMuted }}>{Locale.currency(session()!.cost ?? 0)}</span>
          </Show>
          <Show when={pressure()}>
            {(label) => (
              <span style={{ fg: label() === "compact now" ? theme.error : theme.warning }}>
                {"  ·  "}{label()}
              </span>
            )}
          </Show>
          <Show when={freeRemaining()}>
            {(mins) => (
              <span style={{ fg: theme.accent }}>
                {"  ·  "}free {mins()}
              </span>
            )}
          </Show>
        </text>
      </box>
    </Show>
  )
}
