import { createMemo, For, onMount, Show } from "solid-js"
import { TextAttributes, type RGBA } from "@opentui/core"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { useRenderer } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { useRoute } from "../context/route"
import { useTerminalSize } from "../util/terminal-size"
import { Locale } from "../util/locale"
import { Space } from "./chrome"
import { bucketEvents } from "./kit/bars"
import { BrailleChart } from "./kit/braille-chart"
import { Histogram } from "./kit/histogram-view"
import { Sparkline } from "./kit/sparkline-view"
import { burnSeries } from "./kit/telemetry"
import { DialogColumn, DialogFooter, DialogTitleRow } from "./dialog-chrome"
import { useDialog } from "./dialog"

/**
 * `/pulse` — the session's pulse in three charts.
 *
 * Decisions: approvals per time bucket, stacked by state (a quiet stretch is
 * quiet, a denial wave is visible). Pressure: context size per assistant turn
 * as a filled braille area. Cost: the running total as a sparkline with the
 * total in currency. All three read live sync state; nothing is sampled.
 */
export function DialogPulse() {
  const dialog = useDialog()
  const sync = useSync()
  const route = useRoute()
  const { theme } = useTheme()
  const dimensions = useTerminalSize(useRenderer())

  onMount(() => dialog.setSize("large"))

  const sessionID = () =>
    route.data?.type === "session" ? ((route.data as { sessionID?: string }).sessionID ?? undefined) : undefined
  const messages = () => {
    const id = sessionID()
    return id ? (sync.data.message[id] ?? []) : []
  }
  const chartWidth = () => Math.max(24, Math.min(64, Math.floor(dimensions().width * 0.55)))

  // ── Decisions ─────────────────────────────────────────────────────────
  const decisionOrder = ["pending", "invalidated", "expired", "denied", "approved"] as const
  const decisionColors = (): Record<string, RGBA> => ({
    approved: theme.spineOk,
    denied: theme.spineFail,
    expired: theme.spineGutterElapsed as unknown as RGBA,
    invalidated: theme.warning,
    pending: theme.accent,
  })
  const decisions = createMemo(() => {
    const records = Object.values(sync.data.approvals as Record<string, ApprovalRecord>)
    const events = records
      .map((record) => ({ at: Date.parse(record.createdAt), kind: record.state.toLowerCase() }))
      .filter((event) => Number.isFinite(event.at))
    if (events.length === 0) return []
    const times = events.map((event) => event.at)
    const end = Math.max(Date.now(), ...times)
    const start = Math.max(Math.min(...times), end - 24 * 3_600_000)
    const bucketCount = Math.max(8, Math.min(24, Math.floor(chartWidth() / 3)))
    return bucketEvents(events, Math.min(start, end - 60_000), end, bucketCount)
  })

  // ── Pressure + cost ───────────────────────────────────────────────────
  const pressure = createMemo(() => burnSeries(messages() as never, 64))
  const pressurePeak = createMemo(() => (pressure().length ? Math.max(...pressure()) : 0))
  const costSeries = createMemo(() => {
    let total = 0
    const series: number[] = []
    for (const message of messages() as Array<{ role?: string; cost?: number }>) {
      if (message?.role !== "assistant") continue
      total += typeof message.cost === "number" && Number.isFinite(message.cost) ? message.cost : 0
      series.push(total)
    }
    return series
  })
  const costTotal = createMemo(() => costSeries().at(-1) ?? 0)

  return (
    <DialogColumn padBottom>
      <DialogTitleRow title="Pulse" onClose={() => dialog.clear()} />

      {/* Decisions */}
      <text attributes={TextAttributes.BOLD} fg={theme.accent}>
        Decisions
      </text>
      <Show when={decisions().length > 0} fallback={<text fg={theme.textMuted}>No approvals recorded yet.</text>}>
        <Histogram buckets={decisions()} height={5} order={decisionOrder} colors={decisionColors()} />
        <box flexDirection="row" gap={Space.gapWide} minWidth={0}>
          <For each={decisionOrder}>
            {(kind) => (
              <text wrapMode="none">
                <span style={{ fg: decisionColors()[kind] ?? theme.spineContext }}>■</span>
                <span style={{ fg: theme.spineContext }}>{` ${kind}`}</span>
              </text>
            )}
          </For>
        </box>
        <text fg={theme.textMuted}>
          {`${Locale.time(Date.now() - 24 * 3_600_000)} → ${Locale.time(Date.now())} · workspace approvals`}
        </text>
      </Show>

      {/* Context pressure */}
      <text attributes={TextAttributes.BOLD} fg={theme.accent}>
        Context pressure
      </text>
      <Show
        when={pressure().length >= 2}
        fallback={<text fg={theme.textMuted}>Not enough turns to chart pressure yet.</text>}
      >
        <BrailleChart values={pressure()} width={chartWidth()} height={5} fill />
        <text fg={theme.textMuted}>
          {`turns ${pressure().length} · peak ${Locale.number(pressurePeak())} context tokens`}
        </text>
      </Show>

      {/* Cost */}
      <text attributes={TextAttributes.BOLD} fg={theme.accent}>
        Cost
      </text>
      <Show when={costSeries().length >= 2} fallback={<text fg={theme.textMuted}>No billable turns yet.</text>}>
        <box flexDirection="row" gap={Space.gap} alignItems="center">
          <Sparkline values={costSeries().slice(-24)} width={24} />
          <text fg={theme.spineContext}>{Locale.currency(costTotal())}</text>
        </box>
      </Show>

      <DialogFooter />
    </DialogColumn>
  )
}
