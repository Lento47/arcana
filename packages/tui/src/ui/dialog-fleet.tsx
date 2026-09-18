import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { RGBA } from "@opentui/core"
import type { ToolPart } from "@arcana/sdk/v2"
import { useRenderer } from "@opentui/solid"
import { StatusGlyph } from "../branding"
import { useKV } from "../context/kv"
import { useRoute } from "../context/route"
import { useSync } from "../context/sync"
import { useTheme } from "../context/theme"
import { Motion } from "../util/motion"
import { Locale, truncate } from "../util/locale"
import { useTerminalSize } from "../util/terminal-size"
import { Space } from "./chrome"
import { RadarView } from "./kit/radar-view"
import type { RadarAgent, RadarState } from "./kit/radar"
import { DialogColumn, DialogFooter, DialogTitleRow } from "./dialog-chrome"
import { useDialog } from "./dialog"

/**
 * `/fleet` — the delegated wave, as a live radar scope.
 *
 * The scope answers one question at a glance: what are my subagents doing.
 * Angles are slots in the wave (deterministic, spread over the circle), the
 * radius is work finished (running close, rim = done), and the sweep is time.
 * Liveness is colour and the status glyph canon, never invented load — the
 * engine does not report tokens/s per child yet, and nothing here fakes one.
 *
 * The wave is read from the task tool parts of the current session: their
 * `state.metadata.sessionId` is the engine's own child link, so the scope shows
 * exactly the children this session delegated, not every session in the store.
 */

const TAU = Math.PI * 2
/** Radians per tick; one full rotation ≈ 3.1s at `Motion.step`. */
const SWEEP_RATE = 0.1
const STATUS_ORDER: RadarState[] = ["running", "waiting", "done", "failed"]
const STATE_LABEL: Record<RadarState, string> = {
  running: "running",
  waiting: "waiting",
  done: "done",
  failed: "failed",
}

export function DialogFleet() {
  const dialog = useDialog()
  const sync = useSync()
  const route = useRoute()
  const kv = useKV()
  const { theme } = useTheme()
  const dimensions = useTerminalSize(useRenderer())

  onMount(() => dialog.setSize("large"))

  const current = () =>
    route.data?.type === "session" ? ((route.data as { sessionID?: string }).sessionID ?? undefined) : undefined

  // ── The wave ─────────────────────────────────────────────────────────
  // Task parts carry the child session id in `state.metadata` while the
  // delegation runs and after it settles; that link is the engine's, so the
  // scope never guesses by title.
  const wave = createMemo(() => {
    const parentID = current()
    const messages = parentID ? (sync.data.message?.[parentID] ?? []) : []
    const link = new Map<string, { failed: boolean; created: number }>()
    let order = 0
    for (const message of messages) {
      for (const part of sync.data.part?.[message.id] ?? []) {
        if (part.type !== "tool") continue
        const tool = (part as ToolPart).tool
        if (tool !== "task" && tool !== "subtask") continue
        const state = (part as ToolPart).state as { status?: string; metadata?: Record<string, unknown> }
        const metadata = state.metadata ?? {}
        const sessionID = ["sessionId", "sessionID", "session_id"]
          .map((key) => metadata[key])
          .find((value): value is string => typeof value === "string" && value.trim().length > 0)
        if (!sessionID) continue
        const previous = link.get(sessionID)
        link.set(sessionID, {
          // Last reference wins: a retried delegation must not stay failed.
          failed: state.status === "error",
          created: previous?.created ?? order++,
        })
      }
    }
    const sessions = sync.data.session ?? []
    const byID = new Map(sessions.map((session) => [session.id, session]))
    const entries = [...link.entries()]
      .map(([id, meta]) => ({ session: byID.get(id), meta }))
      .filter((entry): entry is { session: NonNullable<typeof entry.session>; meta: typeof entry.meta } => !!entry.session)
      .toSorted((a, b) => a.meta.created - b.meta.created)
    // Fallback for stores whose task parts predate the sessionId stamp: the
    // children are still linked by parentID.
    const resolved =
      entries.length > 0
        ? entries
        : parentID
          ? sessions
              .filter((session) => session.parentID === parentID)
              .toSorted((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0))
              .map((session) => ({ session, meta: { failed: false, created: 0 } }))
          : []

    const stats = resolved.map(({ session, meta }) => {
      let steps = 0
      let activity = ""
      for (const message of sync.data.message?.[session.id] ?? []) {
        for (const part of sync.data.part?.[message.id] ?? []) {
          if (part.type !== "tool") continue
          const state = (part as ToolPart).state
          if (state.status !== "completed" && state.status !== "error") continue
          steps += 1
          const title = "title" in state && typeof state.title === "string" ? state.title.trim() : ""
          activity = title.length > 0 ? title : (part as ToolPart).tool
        }
      }
      const status = sync.data.session_status[session.id]?.type
      const state: RadarState = meta.failed
        ? "failed"
        : status === "busy" || status === "retry"
          ? "running"
          : status === "waiting"
            ? "waiting"
            : "done"
      const created = session.time?.created ?? 0
      const updated = session.time?.updated ?? 0
      const settled = state === "done" || state === "failed"
      const elapsed = created > 0 ? Locale.duration((settled && updated > created ? updated : Date.now()) - created) : ""
      return { session, state, steps, activity, elapsed }
    })

    const maxSteps = Math.max(1, ...stats.map((entry) => entry.steps))
    const agents: RadarAgent[] = stats.map((entry, index) => ({
      id: entry.session.id,
      index: index + 1,
      state: entry.state,
      progress: entry.steps / maxSteps,
    }))
    return { stats, agents }
  })

  const totals = createMemo(() => {
    const counts = wave().stats.reduce(
      (all, entry) => ({ ...all, [entry.state]: (all[entry.state] ?? 0) + 1 }),
      {} as Partial<Record<RadarState, number>>,
    )
    const parts = STATUS_ORDER.filter((state) => (counts[state] ?? 0) > 0).map(
      (state) => `${counts[state]} ${STATE_LABEL[state]}`,
    )
    return parts.length > 0 ? `wave · ${parts.join(" · ")}` : "wave · empty"
  })

  // ── Scope geometry ──────────────────────────────────────────────────
  const scope = createMemo(() => {
    const view = dimensions()
    const radius = Math.max(8, Math.min(20, Math.floor((view.width - 24) / 6), Math.floor(view.height - 18)))
    return { width: radius * 2 + 1, height: radius + 1, radius }
  })
  const legendWidth = () => Math.max(24, dimensions().width - scope().width - 14)

  // ── Sweep (time) ────────────────────────────────────────────────────
  const [sweep, setSweep] = createSignal(0)
  let timer: ReturnType<typeof setInterval> | undefined
  const stopSweep = () => {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
  createEffect(() => {
    if (kv.get("animations_enabled", true) === false) {
      stopSweep()
      return
    }
    if (timer) return
    timer = setInterval(() => setSweep((value) => (value + SWEEP_RATE) % TAU), Motion.step)
  })
  onCleanup(stopSweep)

  const colorFor = (state: RadarState): RGBA => {
    switch (state) {
      case "running":
        return theme.accent as RGBA
      case "waiting":
        return theme.warning as RGBA
      case "done":
        return theme.spineOk as RGBA
      case "failed":
        return theme.spineFail as RGBA
    }
  }

  return (
    <DialogColumn padBottom>
      <DialogTitleRow title="Fleet" onClose={() => dialog.clear()} />

      <box flexDirection="row" gap={Space.gapWide} minWidth={0} flexGrow={1}>
        <RadarView
          agents={wave().agents}
          width={scope().width}
          height={scope().height}
          sweep={sweep()}
        />
        <box flexDirection="column" flexGrow={1} minWidth={0} gap={0}>
          <text fg={theme.spineContext} wrapMode="none">
            {totals()}
          </text>
          <Show
            when={wave().stats.length > 0}
            fallback={
              <text fg={theme.textMuted} wrapMode="word">
                No subagents delegated from this session.
              </text>
            }
          >
            <For each={wave().stats}>
              {(entry, index) => {
                const meta = () =>
                  [
                    `${entry.steps} ${entry.steps === 1 ? "step" : "steps"}`,
                    entry.activity,
                    entry.elapsed,
                  ]
                    .filter((part) => part.length > 0)
                    .join(" · ")
                return (
                  <text wrapMode="none">
                    <span style={{ fg: theme.spineContext }}>{String(index() + 1).padStart(2, "0")}</span>
                    <span style={{ fg: colorFor(entry.state) }}>{` ${StatusGlyph[entry.state === "waiting" ? "pending" : entry.state]} `}</span>
                    <span style={{ fg: theme.spineBrand }}>{truncate(entry.session.title ?? entry.session.id, 24)}</span>
                    <span style={{ fg: theme.spineContext }}>
                      {`  ${truncate(meta(), Math.max(8, legendWidth() - 32))}`}
                    </span>
                  </text>
                )
              }}
            </For>
            <text fg={theme.textMuted} wrapMode="none">
              rim = finished · sweep = time
            </text>
          </Show>
        </box>
      </box>

      <DialogFooter />
    </DialogColumn>
  )
}
