import { createMemo, createSignal, onMount, Show } from "solid-js"
import { TextAttributes, type RGBA } from "@opentui/core"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { useRenderer } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { useRoute } from "../context/route"
import { useBindings } from "../keymap"
import { useTerminalSize } from "../util/terminal-size"
import { Space } from "./chrome"
import { timelineCells, timelineLanes, type TimelineMark, type TimelineSpan } from "./kit/timeline"
import { Waterfall } from "./kit/waterfall-view"
import { DialogColumn, DialogFooter, DialogTitleRow } from "./dialog-chrome"
import { useDialog } from "./dialog"

/**
 * `/timeline` — the session as lanes over time.
 *
 * One lane per session (main first, then its subagents): spans are tool
 * executions, marks are the moments that matter — approvals, failures,
 * compactions. `z` toggles between the whole session and the last minute.
 */
export function DialogTimeline() {
  const dialog = useDialog()
  const sync = useSync()
  const route = useRoute()
  const { theme } = useTheme()
  const dimensions = useTerminalSize(useRenderer())
  const [windowMode, setWindowMode] = createSignal<"full" | "1m">("full")

  onMount(() => dialog.setSize("large"))

  useBindings(() => ({
    bindings: [
      {
        key: "z",
        desc: "Zoom the timeline",
        group: "Dialog",
        cmd: () => setWindowMode((mode) => (mode === "full" ? "1m" : "full")),
      },
      { key: "escape", desc: "Close timeline", group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  const current = () =>
    route.data?.type === "session" ? ((route.data as { sessionID?: string }).sessionID ?? undefined) : undefined

  const lanes = createMemo(() => {
    const id = current()
    if (!id) return [] as Array<{ id: string; label: string }>
    const children = (sync.data.session ?? []).filter((session) => session.parentID === id)
    return [
      { id, label: "main" },
      ...children.map((session) => {
        const title = (session.title ?? session.id).replace(/\s*\(@[\s\S]*$/, "")
        return { id: session.id, label: `↳ ${title}` }
      }),
    ]
  })

  const graph = createMemo(() => {
    const spans: TimelineSpan[] = []
    const marks: TimelineMark[] = []
    const laneIDs = new Set(lanes().map((lane) => lane.id))
    for (const lane of lanes()) {
      const messages = sync.data.message[lane.id] ?? []
      for (const message of messages) {
        const parts = sync.data.part[message.id] ?? []
        for (const part of parts) {
          if (part.type === "tool") {
            const state = (part as { state?: { status?: string; time?: { start?: number; end?: number } } }).state
            const start = state?.time?.start
            if (typeof start !== "number") continue
            const end = typeof state?.time?.end === "number" ? state.time.end : Date.now()
            spans.push({ lane: lane.id, start, end, kind: state?.status === "error" ? "fail" : "tool" })
            if (state?.status === "error") marks.push({ lane: lane.id, at: end, kind: "fail", glyph: "✗" })
          }
          if (part.type === "compaction") {
            marks.push({
              lane: lane.id,
              at: message.time?.created ?? Date.now(),
              kind: "compaction",
              glyph: "┈",
            })
          }
        }
      }
    }
    for (const record of Object.values(sync.data.approvals as Record<string, ApprovalRecord>)) {
      if (!laneIDs.has(record.sessionId)) continue
      const at = Date.parse(record.createdAt)
      if (!Number.isFinite(at)) continue
      const glyph =
        record.state === "APPROVED" ? "✓" : record.state === "PENDING" ? "△" : record.state === "EXPIRED" ? "┈" : "✗"
      marks.push({ lane: record.sessionId, at, kind: record.state.toLowerCase(), glyph })
    }
    return { spans, marks }
  })

  const range = createMemo(() => {
    const now = Date.now()
    if (windowMode() === "1m") return { start: now - 60_000, end: now }
    const times = [
      ...graph().spans.flatMap((span) => [span.start, span.end]),
      ...graph().marks.map((mark) => mark.at),
    ].filter((value) => Number.isFinite(value))
    if (times.length === 0) return { start: now - 60_000, end: now }
    const start = Math.min(...times)
    const end = Math.max(now, Math.max(...times))
    return { start, end: Math.max(end, start + 1_000) }
  })

  const width = () => Math.max(20, Math.min(80, dimensions().width - 20))

  const colors = (): Record<string, RGBA> => ({
    tool: theme.spineContext,
    fail: theme.spineFail,
    compaction: theme.spineGutterElapsed as unknown as RGBA,
    approved: theme.spineOk,
    denied: theme.spineFail,
    expired: theme.spineGutterElapsed as unknown as RGBA,
    invalidated: theme.warning,
    pending: theme.accent,
  })

  const rows = createMemo(() => {
    const lanesNow = timelineLanes({ spans: graph().spans, marks: graph().marks, order: lanes().map((lane) => lane.id) })
    return timelineCells({
      spans: graph().spans,
      marks: graph().marks,
      lanes: lanesNow,
      start: range().start,
      end: range().end,
      width: width(),
    })
  })

  const failed = createMemo(() => graph().marks.filter((mark) => mark.kind === "fail").length)
  const approvals = createMemo(
    () => graph().marks.filter((mark) => ["approved", "denied", "pending", "expired", "invalidated"].includes(mark.kind)).length,
  )
  const compactions = createMemo(() => graph().marks.filter((mark) => mark.kind === "compaction").length)

  return (
    <DialogColumn padBottom>
      <DialogTitleRow title="Timeline" onClose={() => dialog.clear()} />

      <text fg={theme.textMuted} wrapMode="none">
        {`z zoom · ${windowMode() === "full" ? "whole session" : "last 60s"} · spans are tool runs`}
      </text>
      <text fg={theme.textMuted} wrapMode="none">
        {"✓ approved · ✗ denied/failed · △ pending · ┈ compaction"}
      </text>

      <Show
        when={lanes().length > 0 && rows().length > 0}
        fallback={<text fg={theme.textMuted}>No activity recorded in this session yet.</text>}
      >
        <Waterfall
          rows={rows()}
          labels={lanes().map((lane) => lane.label)}
          labelWidth={12}
          colors={colors()}
        />
      </Show>

      <text attributes={TextAttributes.BOLD} fg={theme.accent}>
        {`${graph().spans.length} runs · ${failed()} failed · ${approvals()} approval marks · ${compactions()} compactions`}
      </text>

      <DialogFooter />
    </DialogColumn>
  )
}
