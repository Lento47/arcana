import type { AssistantMessage } from "@arcana/sdk/v2"
import type { TuiPlugin, TuiPluginApi } from "@arcana/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { Locale } from "../../util/locale"
import { rendererWidth } from "../../util/geometry"
import {
  compactNowPercent,
  compactSoonPercent,
  contextUsageFor,
  hasContextUsage,
  type CompactionLite,
} from "../../util/context-pressure"
import { Lexicon, Glyph } from "../../branding"
import { ShimmerText } from "../../component/shimmer-text"
import { selectedForeground } from "../../context/theme"
import { CliRenderEvents } from "@opentui/core"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"

const id = "internal:statusbar"

/**
 * Below this the bar stops carrying its decorative meter and its cost. The bar
 * is one content row, and its segments do not all earn their columns equally:
 * the model name and the token readout are the parts an operator reads, while
 * the meter run repeats the percentage printed beside it and the cost is the
 * least urgent thing in the line. 100 is the width at which the whole line
 * fits; below it the decorative pair gives way, because clipping a number to
 * keep a bar that restates it is the wrong trade.
 */
const COMPACT_WIDTH = 100

/**
 * The narrowest the model name may become. Every other segment of the bar is
 * `flexShrink={0}`, so the name absorbs the slack yoga has left and is clipped
 * from the right; without a floor it was squeezed to `claud`, which reads as a
 * different model. With one, the worst case is a recognisable prefix.
 */
const MODEL_MIN = 16

interface BarSegment { filled: boolean; glyph: string }

/**
 * The boundary cell's ramp, in the proof-tape's own vocabulary: a dot, then a
 * dash, then the next block. Ten cells alone quantise the readout to 10%
 * steps, so a meter that has just moved sat on the same cell as one about to
 * leave it and the bar looked frozen near the thresholds that matter — the
 * ones that raise COMPACT SOON and COMPACT NOW. The two tape cells cost
 * nothing, are already the app's "between" marks, and give the cell four
 * densities: `▱`, `·`, `–`, `▰`.
 */
const PARTIAL_CELLS = ["·", "–"] as const

/**
 * The width the bar lays out for, or `undefined` when there is none to measure.
 * A plugin is handed the renderer, and this guards the value itself: arithmetic
 * on a missing measurement silently becomes `NaN`, and a `NaN` model budget
 * reached `Locale.truncate`, which answers `NaN` with an empty string — the
 * name vanished from the bar entirely rather than merely going unmeasured.
 */
export const statusbarWidth = rendererWidth

/** Narrow enough that the decorative meter and the cost give way. */
export function isCompactWidth(width: number | undefined): boolean {
  return width !== undefined && width < COMPACT_WIDTH
}

/**
 * The retry segment's text: `retry 2 in 4s`, or `retry 2 now` once the wait is
 * over.
 *
 * It carried a `↻`, which is the cache-*write* mark in the metrics bar's legend
 * — `↺`/`↻` is that legend's read/write pair — and the metrics bar sits inside
 * the prompt directly above this row, so one glyph meant two things on one
 * screen. The spine spells retry in words as well (`retry 2/3 in 4s`), which
 * makes words the house vocabulary for it.
 *
 * The provider's message is deliberately absent for the same reason the attempt
 * count is present: this is a one-row instrument, and a sentence belongs in the
 * spine or the retry dialog, both of which already carry it.
 */
export function retryLabel(status: { attempt?: number; next?: number } | undefined, now: number): string {
  const attempt = status?.attempt
  const head = attempt === undefined ? "retry" : `retry ${attempt}`
  if (status?.next === undefined) return head
  const seconds = Math.max(0, Math.ceil((status.next - now) / 1000))
  return seconds > 0 ? `${head} in ${seconds}s` : `${head} now`
}

export function renderBar(pct: number): BarSegment[] {
  const clamped = Math.max(0, Math.min(100, pct))
  const cells = clamped / 10
  const full = Math.floor(cells)
  const fraction = cells - full
  const segments: BarSegment[] = []
  for (let i = 0; i < 10; i++) {
    if (i < full) {
      segments.push({ filled: true, glyph: "▰" })
      continue
    }
    if (i === full && fraction > 0) {
      // The cell the meter is currently crossing. It counts as fill for colour
      // so the ramp brightens with the bar rather than flickering between the
      // fill and empty tokens as it advances.
      segments.push({ filled: true, glyph: PARTIAL_CELLS[Math.floor(fraction * PARTIAL_CELLS.length)]! })
      continue
    }
    segments.push({ filled: false, glyph: "▱" })
  }
  return segments
}

/**
 * Compact model name for statusbar display. Preserves trailing date suffix
 * (e.g. YYYYMMDD) so model versions remain distinguishable at a glance.
 */
function compactModelName(value: string): string {
  // T9: budget is display columns, not code units — CJK/emoji model names
  // would otherwise render at 2× the 50-col budget.
  if (Locale.displayWidth(value) <= 50) return value
  // Try to preserve a trailing date suffix: ...20260514
  const dateMatch = value.match(/[-_](\d{8}|\d{4}-\d{2}-\d{2})$/)
  if (dateMatch) {
    const suffix = dateMatch[0] // e.g. "-20260514"
    // Reserve columns for the suffix; truncate the prefix by display width.
    return Locale.truncate(value, 50 - Locale.displayWidth(suffix)) + suffix
  }
  return Locale.truncate(value, 50)
}

function tokenStateLabel(percent: number | null, compacting: boolean, soon: number, now: number): string {
  if (compacting) return "compacting"
  if (percent === null) return "unbounded"
  if (percent >= now) return "critical"
  if (percent >= soon) return "high"
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
      (item): item is AssistantMessage => item.role === "assistant" && hasContextUsage(item.tokens),
    )
  })

  const model = createMemo(() => {
    const last = latestAssistant()
    if (!last) return undefined
    const provider = api.state?.provider?.find((item) => item.id === last.providerID)
    return compactModelName(provider?.models[last.modelID]?.name ?? last.modelID)
  })

  const compaction = createMemo<CompactionLite | undefined>(() => api.state?.config?.compaction)

  const usage = createMemo(() => {
    const last = latestUsageAssistant()
    if (!last) return undefined
    const limit = api.state?.provider?.find((item) => item.id === last.providerID)?.models[last.modelID]?.limit
    return contextUsageFor({ tokens: last.tokens, limit, compaction: compaction() })
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
    if (compacting()) return undefined
    const label = usage()?.pressure
    if (label === "compact now") return { label: "COMPACT NOW", color: theme().error }
    if (label === "compact soon") return { label: "COMPACT SOON", color: theme().warning }
    return undefined
  })

  const retry = createMemo(() => {
    const value = status()
    return value?.type === "retry" ? value : undefined
  })

  /**
   * The countdown is the only thing on this bar that moves without the session
   * sending anything, so it keeps its own clock — and only while a retry is
   * actually pending: a bar that re-renders every second for no reason repaints
   * the whole screen every second.
   */
  const [now, setNow] = createSignal(Date.now())
  createEffect(() => {
    if (!retry()) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })

  const busyVerb = createMemo(() => {
    // Compaction is already announced by the chip below, in the same line and
    // in the warning colour. The shimmer used to repeat it as prose, so one
    // fact was painted twice and the redundant copy was the longer of the two.
    if (compacting()) return ""
    if (!busy()) return ""
    return "Thinking…"
  })

  /**
   * The bar lays out against the renderer it was handed rather than a context
   * hook: a plugin is given the renderer, and `useTerminalDimensions()` is
   * undefined outside a live terminal, which would leave the budget unmeasured.
   * The subscription is what keeps it honest across a resize — a bar still laid
   * out for the old width either clips or wastes the new one.
   */
  const [termWidth, setTermWidth] = createSignal(statusbarWidth(api.renderer))
  createEffect(() => {
    const renderer = api.renderer
    if (!renderer) return
    const update = () => setTermWidth(statusbarWidth(renderer))
    update()
    renderer.on(CliRenderEvents.RESIZE, update)
    onCleanup(() => renderer.off(CliRenderEvents.RESIZE, update))
  })
  const compact = () => isCompactWidth(termWidth())

  // C4: the chip is flush with the bar's left edge when it is the first visible
  // element (no busy shimmer leads). The bar collapses its padding and the chip
  // absorbs it (3 = bar 0 + chip 3), so the solid block reaches the edge instead
  // of floating on the transparent bar background.
  const chipAtEdge = () => !busyVerb() && (compacting() || contextPressure())

  // The bar is one content row and must stay one content row. Every segment
  // below is `flexShrink={0}` with `wrapMode="none"`, so when the terminal is
  // narrower than the readout the tail clips at the edge instead of wrapping.
  // Wrapping was the real behaviour: a 48-column model name plus the meter, the
  // token total and the cost overflowed a 100-column terminal and broke
  // mid-token, and the bar grew to four rows — pushing the prompt down and
  // shoving the top border away from the text it frames.
  return (
    <Show when={sessionID() && (shell() === "command-spine" ? (compacting() || contextPressure()) : (busy() || compacting() || model() || usage()))}>
      <box
        width="100%"
        flexDirection="row"
        flexShrink={0}
        alignItems="center"
        gap={2}
        minWidth={0}
        overflow="hidden"
        paddingLeft={chipAtEdge() ? 0 : 2}
        paddingRight={2}
        backgroundColor={theme().background}
        border={["top"]}
        borderColor={theme().borderSubtle}
      >
        <Show when={busyVerb()}>
          <box flexShrink={0}>
            <ShimmerText text={busyVerb()} active={true} background={theme().background as any} />
          </box>
        </Show>
        <Show when={compacting()}>
          <box flexShrink={0} backgroundColor={theme().warning} paddingLeft={chipAtEdge() ? 3 : 1} paddingRight={1}>
            <text wrapMode="none" fg={selectedForeground(theme(), theme().warning)}>
              <span style={{ fg: selectedForeground(theme(), theme().warning), bold: true }}>
                ⟳ COMPACTING
              </span>
            </text>
          </box>
        </Show>
        <Show when={contextPressure()}>
          {(pressure) => (
            <box flexShrink={0} backgroundColor={pressure().color} paddingLeft={chipAtEdge() ? 3 : 1} paddingRight={1}>
              <text wrapMode="none" fg={selectedForeground(theme(), pressure().color)}>
                <span style={{ fg: selectedForeground(theme(), pressure().color), bold: true }}>
                  {pressure().label}
                </span>
              </text>
            </box>
          )}
        </Show>
        <Show when={retry()}>
          {(value) => (
            <text flexShrink={0} wrapMode="none" fg={theme().warning}>{retryLabel(value(), now())}</text>
          )}
        </Show>
        <Show when={model()}>
          {(value) => (
            // The model name is the only segment that gives ground: it absorbs
            // the slack the fixed segments leave, and is clipped from the right.
            // `minWidth` is the floor that keeps a clipped name recognisable.
            <text flexShrink={1} minWidth={MODEL_MIN} wrapMode="none" fg={theme().textMuted}>
              {Glyph.sigil} {compactModelName(value())}
            </text>
          )}
        </Show>
        <Show when={mlRuntime()}>
          <text flexShrink={0} wrapMode="none" fg={theme().primary}>
            <span style={{ fg: theme().primary, bold: true }}>ML</span>
          </text>
        </Show>
        <Show when={!compact()}>
          <Show when={usage()}>
            {(u) => (
              <Show when={u().percent !== null}>
                {/* The card borders' own rule glyph, dimmed — an ASCII pipe
                    was the one mark in the line that belonged to no family. */}
                <text flexShrink={0} wrapMode="none" fg={theme().borderSubtle}>│</text>
                <text flexShrink={0} wrapMode="none" fg={theme().primary}>
                  <For each={renderBar(u().percent!)}>
                    {(seg) => {
                      const soon = compactSoonPercent(compaction())
                      const now = compactNowPercent(compaction())
                      const fillColor =
                        u().percent! >= now ? theme().error : u().percent! >= soon ? theme().warning : theme().primary
                      return <span style={{ fg: seg.filled ? fillColor : theme().textMuted }}>{seg.glyph}</span>
                    }}
                  </For>
                </text>
              </Show>
            )}
          </Show>
        </Show>
        <box flexGrow={1} minHeight={0} />
        <Show when={usage()}>
          {(value) => (
            <text flexShrink={0} wrapMode="none" fg={theme().textMuted}>
              <span style={{ fg: theme().primary }}>CTX</span>{" "}
              <span style={{ fg: theme().primary }}>{Locale.number(value().tokens)}</span>
              {/* The separator space travels with the label it precedes, so
                  dropping the label below the breakpoint leaves one space
                  before the meter rather than two. */}
              {compact() ? "" : ` ${Lexicon.Token.label}`}
              <Show when={value().percent !== null}>
                {/* The space lives inside the run: JSX drops whitespace-only
                    text between elements when it spans a line break, so
                    `{label}` followed by a newline-indented `<span>` rendered
                    as `glyphs▰` — the meter collided with the word.
                    No glyph here: the ten-cell meter a few columns to the left
                    is the meter, and a lone `▰` in front of a number read as a
                    one-cell fragment of it. */}
                <span style={{ fg: theme().secondary }}>{" "}{value().percent + "%"}</span>
              </Show>
              <Show when={!compact()}>
                <span style={{ fg: compacting() ? theme().warning : theme().textMuted }}>
                  {" "}
                  {tokenStateLabel(
                    value().percent,
                    compacting(),
                    compactSoonPercent(compaction()),
                    compactNowPercent(compaction()),
                  )}
                </span>
              </Show>
            </text>
          )}
        </Show>
        <Show when={!compact()}>
          <Show when={cost() !== undefined && cost()! > 0}>
            <text flexShrink={0} wrapMode="none" fg={theme().textMuted}>
              {Glyph.diamond} {Locale.currency(cost()!)}
            </text>
          </Show>
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
