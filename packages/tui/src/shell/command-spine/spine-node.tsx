import { For, Show, createMemo } from "solid-js"
import type { MouseEvent } from "@opentui/core"
import { useTheme } from "../../context/theme"
import type { Theme } from "../../theme"
import { displayWidth, truncate } from "../../util/locale"
import {
  compactSpineElapsed,
  formatElapsedMs,
  spineElapsedMax,
  spineTone,
  type SpineKind,
  type SpineLayout,
} from "./spine-types"
import { thinkingRowChrome, toolChipChrome } from "./spine-chrome"
import { useSpineMotion } from "./spine-motion"
import { ShimmerText } from "../../component/shimmer-text"

/**
 * Meta parts that must live in a `flexShrink={0}` sibling box beside the
 * word-wrapping summary text (audit M1) — never inside the `wrapMode="word"`
 * node. When embedded inline, a wrapping summary strands the chevron/elapsed
 * on their own line (meta floats alone under the content). Tone tags the
 * part so the render path can color the chevron with the summary tone and
 * the elapsed with `spineGutterElapsed` without interleaving them into text.
 */
export type NodeMetaPart = { text: string; tone: "summary" | "elapsed" }

export function nodeMetaStrip(disclosure: string, elapsed: string): NodeMetaPart[] {
  const parts: NodeMetaPart[] = []
  if (disclosure) parts.push({ text: ` ${disclosure}`, tone: "summary" })
  if (elapsed) parts.push({ text: ` · ${elapsed}`, tone: "elapsed" })
  return parts
}

/** Max characters for the tool label column (short verbs: search, read, run). */
const TOOL_LABEL_WIDTH = 7
/** Wider column for chat voice so "assistant" / "you" are not truncated. */
const CHAT_LABEL_WIDTH = 10

function patchSummaryColor(part: string, index: number, theme: Theme) {
  if (part.startsWith("+")) return theme.spineDiffAdd
  if (part.startsWith("-")) return theme.spineDiffRemove
  if (part === "diff") return theme.spineOk
  if (part.includes("unavailable") || part.includes("incomplete") || part.includes("file-list only")) return theme.warning
  return index === 0 ? theme.spineDiffMuted : theme.text
}

function PatchSummaryText(props: { summary: string; theme: Theme }) {
  const parts = createMemo(() => props.summary.split(/\s+·\s+/).filter(Boolean))
  return (
    <text wrapMode="word">
      <For each={parts()}>
        {(part, index) => (
          <>
            <Show when={index() > 0}>
              <span style={{ fg: props.theme.spineDiffMuted }}> · </span>
            </Show>
            <span style={{ fg: patchSummaryColor(part, index(), props.theme) }}>{part}</span>
          </>
        )}
      </For>
    </text>
  )
}

/** Truncate/pad actor name to the column width, display-column aware (audit T4). */
function truncateActor(name: string, width: number): string {
  const w = displayWidth(name)
  if (w <= width) return name + " ".repeat(width - w)
  return truncate(name, width)
}

/**
 * Compact tool / think header row.
 *
 * All props are read through accessors/memos so streaming chrome and summary
 * text update without remounting the row.
 * Earlier versions captured props once at mount and froze "writing/thinking"
 * after the turn ended.
 */
export function SpineNode(props: {
  kind: SpineKind
  label?: string
  summary: string
  actor?: string
  layout: SpineLayout
  focused?: boolean
  /** Optional duration from the entry — shown muted after the label/summary. */
  elapsed?: string
  /** Absolute start time (unix ms) — a ticking elapsed replaces `elapsed` while streaming. */
  startMs?: number
  /** Optional disclosure chevron for collapsible rows (e.g. thinking). */
  disclosure?: "▸" | "▾" | ""
  /** True while the row is still streaming. */
  streaming?: boolean
  /** Merged think verb for tool rows — shows inline after the tool glyph. */
  thinking?: string
  /** Stable row cue used by the shell's single-animation arbiter. */
  cueID?: string
  /** Dedicated disclosure action; lets agent titles navigate while chevrons expand. */
  onDisclosureMouseUp?: (event: MouseEvent) => void
  /** Dismiss affordance ("×") for cancellable rows (approval banners). */
  onDismiss?: () => void
}) {
  const { theme } = useTheme()
  const motion = useSpineMotion()

  const kind = () => props.kind
  const layout = () => props.layout
  const label = createMemo(() => (props.label ?? props.kind).trim())
  const summary = createMemo(() => props.summary?.trim() ?? "")
  const actor = createMemo(() => props.actor?.trim() ?? "")
  const disclosure = createMemo(() => props.disclosure ?? "")
  const thinking = createMemo(() => props.thinking)
  const streaming = createMemo(() => props.streaming === true)

  // Live ticking chrome: while a running row carries an absolute start time,
  // re-render every second so subagents/tools show a spinning braille frame and
  // a progress elapsed without waiting for the next engine update. Falls back to
  // the static entry duration and a static glyph.
  const live = createMemo(
    () => streaming() && typeof props.startMs === "number" && Number.isFinite(props.startMs),
  )
  const cueActive = createMemo(() => streaming() && (motion?.isCueActive(props.cueID) ?? true))
  const activityColor = createMemo(() => {
    if (!cueActive()) return kind() === "think" ? theme.spineThink : theme.accent
    // Two interval phases per color produces a calm 2 Hz cue at the shared
    // 250 ms cadence. The glyph and text geometry never change.
    return Math.floor((motion?.phase() ?? 0) / 2) % 2 === 0 ? theme.accent : theme.spineRun
  })
  const elapsedText = createMemo(() => {
    const max = spineElapsedMax(props.layout)
    if (live()) {
      void motion?.phase()
      const ms = Math.max(0, Date.now() - (props.startMs as number))
      return compactSpineElapsed(formatElapsedMs(ms), max)
    }
    return compactSpineElapsed(props.elapsed, max)
  })

  const isChat = createMemo(() => {
    const k = kind()
    return k === "ask" || k === "plan" || k === "ok"
  })
  const isTool = createMemo(() => {
    const k = kind()
    return k === "inspect" || k === "run" || k === "patch" || k === "fail" || k === "agent"
  })

  const labelWidth = createMemo(() => {
    if (isChat()) return CHAT_LABEL_WIDTH
    if (kind() === "agent") return layout() === "minimal" ? 8 : 12
    return layout() === "minimal" ? 7 : 10
  })
  const showLabel = createMemo(
    () => !!label() && layout() !== "minimal" && kind() !== "think",
  )
  const showActor = createMemo(() => !!actor() && actor() === "you")

  const chip = createMemo(() => toolChipChrome({ kind: kind(), label: label(), streaming: streaming() }))
  const thinkChrome = createMemo(() =>
    thinkingRowChrome({ streaming: streaming(), title: summary() }),
  )
  const tone = createMemo(() => spineTone(kind(), theme))
  const summaryColor = createMemo(() => {
    if (kind() === "fail") return theme.spineFail
    if (kind() === "think") return streaming() ? activityColor() : theme.spineThink
    if (isChat()) return theme.spineDiffMuted
    if (isTool()) return theme.text
    return theme.text
  })
  const labelColor = createMemo(() => {
    if (isChat()) return theme.spineBrand
    if (isTool()) return theme.spineContext
    return tone()
  })

  const truncatedLabel = createMemo(() => truncate(label(), labelWidth()))
  // Agent chips (subagent rows) pad the label to the full column width: the
  // fixed-width box / row gap is not a reliable separator across renderers,
  // so the chip text itself carries trailing spaces and the summary can
  // never merge into the agent name ("generalSimple").
  const chipLabel = createMemo(() =>
    kind() === "agent" ? truncateActor(label(), labelWidth()) : truncatedLabel(),
  )

  // M1: the wrapping text node carries ONLY the summary; the chevron + elapsed
  // render in a flexShrink={0} sibling so a wrapped summary can never strand
  // meta alone on its own line. No flexGrow on the summary box: meta follows
  // the content (not pinned to the right edge), so it stays visually identical
  // to the pre-fix inline position.
  const summaryBody = () => (
    <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
      <box flexShrink={1} minWidth={0}>
        <Show
          when={kind() === "think" && streaming()}
          fallback={
            <text fg={summaryColor()} wrapMode="word">
              {summary() || " "}
            </text>
          }
        >
          <ShimmerText text={summary() || "Thinking…"} active accent={theme.accent} cue={props.cueID} animation="sweep" />
        </Show>
      </box>
      <Show when={disclosure()}>
        <box flexShrink={0} onMouseUp={props.onDisclosureMouseUp}>
          <text fg={summaryColor()} wrapMode="none"> {disclosure()}</text>
        </box>
      </Show>
      <Show when={elapsedText()}>
        <text fg={theme.spineGutterElapsed} wrapMode="none"> · {elapsedText()}</text>
      </Show>
    </box>
  )

  const actorBox = () => (
    <Show when={showActor()}>
      <box flexShrink={0} width={kind() === "agent" ? 12 : 5}>
        <text fg={theme.spineActor}>
          {truncateActor(actor(), kind() === "agent" ? 12 : 5)}
        </text>
      </box>
    </Show>
  )

  // Think / label-less rows: summary fills the line (+ optional chevron + elapsed).
  return (
    <Show
      when={showLabel()}
      fallback={
        <Show
          when={layout() === "minimal"}
          fallback={
            <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
              {actorBox()}
              <Show when={thinking()}>
                <box flexDirection="row" gap={1} flexShrink={0} alignItems="center">
                  <text fg={activityColor()} wrapMode="none">
                    {thinking() || thinkChrome().verb}
                  </text>
                  <text fg={theme.spineDiffMuted}>·</text>
                </box>
              </Show>
              {summaryBody()}
            </box>
          }
        >
          <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1}>
            <text fg={isChat() ? theme.spineOk : summaryColor()} wrapMode="word">
              {isChat() ? `${label()}  ` : ""}
              {summary()}
            </text>
            <Show when={disclosure()}>
              <box flexShrink={0} onMouseUp={props.onDisclosureMouseUp}>
                <text fg={summaryColor()} wrapMode="none"> {disclosure()}</text>
              </box>
            </Show>
            <Show when={props.onDismiss}>
              <box flexShrink={0} paddingLeft={1} onMouseUp={() => props.onDismiss?.()}>
                <text fg={theme.textMuted} wrapMode="none">×</text>
              </box>
            </Show>
          </box>
        </Show>
      }
    >
      {/* Labeled tool / chat header */}
      <Show
        when={summary()}
        fallback={
          <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
            <box flexShrink={0} width={isChat() ? labelWidth() : undefined}>
              <text fg={labelColor()} wrapMode="none">
                {isChat() ? label().padEnd(labelWidth()) : label()}
              </text>
            </box>
            <Show when={elapsedText()}>
              <text fg={theme.spineGutterElapsed} wrapMode="none">{` · ${elapsedText()}`}</text>
            </Show>
            {actorBox()}
            <box flexGrow={1} minWidth={0} />
          </box>
        }
      >
        <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start" gap={1}>
          <Show
            when={isTool()}
            fallback={
              <box flexShrink={0} width={labelWidth()}>
                <text fg={labelColor()}>{truncatedLabel()}</text>
              </box>
            }
          >
            <box flexShrink={0} width={labelWidth()}>
              <text
                fg={chip().status === "fail" ? theme.spineFail : chip().status === "live" ? activityColor() : labelColor()}
                wrapMode="none"
              >
                {chip().glyph} {chipLabel()}
              </text>
            </box>
          </Show>
          {actorBox()}
          <Show when={thinking()}>
            <text fg={activityColor()} wrapMode="none">
              {thinking() || thinkChrome().verb}
            </text>
            <text fg={theme.spineDiffMuted} wrapMode="none">·</text>
          </Show>
          <box flexGrow={1} minWidth={0} flexShrink={1}>
            <Show
              when={kind() === "patch"}
              fallback={
                <text fg={summaryColor()} wrapMode="word">
                  {summary()}
                </text>
              }
            >
              <PatchSummaryText summary={summary()} theme={theme} />
            </Show>
          </box>
          <Show when={disclosure()}>
            <box flexShrink={0} onMouseUp={props.onDisclosureMouseUp}>
              <text fg={summaryColor()} wrapMode="none">{disclosure()}</text>
            </box>
          </Show>
          <Show when={elapsedText()}>
            <box flexShrink={0}>
              <text fg={theme.spineGutterElapsed} wrapMode="none">{elapsedText()}</text>
            </box>
          </Show>
          <Show when={props.onDismiss}>
            <box flexShrink={0} paddingLeft={1} onMouseUp={() => props.onDismiss?.()}>
              <text fg={theme.textMuted} wrapMode="none">×</text>
            </box>
          </Show>
        </box>
      </Show>
    </Show>
  )
}
