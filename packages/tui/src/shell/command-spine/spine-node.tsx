import { Show, createMemo } from "solid-js"
import type { MouseEvent } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { Glyph } from "../../branding"
import { displayWidth, truncate } from "../../util/locale"
import {
  compactSpineElapsed,
  formatElapsedMs,
  spineElapsedMax,
  spineTone,
  type SpineKind,
  type SpineLayout,
  type SpineReceipt,
} from "./spine-types"
import { thinkingRowChrome } from "./spine-chrome"
import { useSpineMotion } from "./spine-motion"
import { ShimmerText } from "../../component/shimmer-text"
import { SpineToolChip } from "./spine-tool-chip"

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

/** Wider column for chat voice so "assistant" / "you" are not truncated. */
const CHAT_LABEL_WIDTH = 10

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
  /** Receipt outcome shown in the shared semantic tool chip. */
  receipt?: SpineReceipt
  /** Measured content width used to truncate the collapsed chip preview. */
  contentWidth?: number
  /** Optional wall-clock timestamp (chat voice only) — shown on the right,
      next to elapsed. Lets collapsed user prompts keep their timestamp visible
      without rendering the full chat card. */
  timestamp?: string
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
  // refresh only the elapsed duration. The shared chip keeps its status glyph
  // stable so progress never looks like a different operation.
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
    return k === "inspect" || k === "run" || k === "patch" || k === "fix" || k === "fail" || k === "agent" || k === "report"
  })

  // Wall-clock timestamp for chat voice — minimal layout skips timestamps
  // entirely (no right column). Tool rows ignore the prop; only the chat
  // path forwards a timestamp via RowHeader.
  const timestampText = createMemo(() => {
    if (props.layout === "minimal") return ""
    return (props.timestamp ?? "").trim()
  })
  const showTimestamp = createMemo(() => !isChat() ? false : !!timestampText())

  const showLabel = createMemo(
    () => isTool() || (!!label() && layout() !== "minimal" && kind() !== "think"),
  )
  const showActor = createMemo(() => !!actor() && actor() === "you")

  const thinkChrome = createMemo(() =>
    thinkingRowChrome({ streaming: streaming(), title: summary() }),
  )
  const tone = createMemo(() => spineTone(kind(), theme))
  const summaryColor = createMemo(() => {
    if (kind() === "fail") return theme.spineFail
    if (kind() === "think") return streaming() ? activityColor() : theme.spineThink
    // User chat voice: text reads against the soft row fill (backgroundElement).
    // Use the bright text token so glyph/summary/meta stay legible without
    // shouting. Assistant chat voice stays muted (text renders inside the
    // bordered card against the panel background).
    if (isChat()) return kind() === "ask" ? theme.text : theme.spineDiffMuted
    if (isTool()) return theme.text
    return theme.text
  })
  // Right-side meta color (elapsed, timestamp). Same logic as summaryColor:
  // bright on the soft user-row fill, muted on the assistant card.
  const metaColor = createMemo(() =>
    isChat() && kind() === "ask" ? theme.textMuted : theme.spineGutterElapsed,
  )
  const labelColor = createMemo(() => {
    // Chat voice: user prompts get spineAsk (matches SpineChatCard convention)
    // and assistant turns get spineBrand. The color shift is the only
    // visual signal distinguishing user from assistant when the user row
    // is collapsed — the box and background stay flat per design.
    if (isChat()) {
      return kind() === "ask" ? theme.spineAsk : theme.spineBrand
    }
    if (isTool()) return theme.spineContext
    return tone()
  })

  // User chat rows render the speaker glyph in the row's contrast color
  // (the panel background, since the outer row carries a spineAsk fill).
  // No text label ("you") is needed — the colored row is the user identity.
  // Assistant turns keep their full speaker label for attribution.
  const labelText = createMemo(() => {
    if (isChat() && kind() === "ask") return Glyph.diamond
    return label()
  })

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
        <text fg={metaColor()} wrapMode="none"> · {elapsedText()}</text>
      </Show>
      <Show when={showTimestamp()}>
        <text fg={metaColor()} wrapMode="none"> · {timestampText()}</text>
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
      {/* Tool rows use one explicit semantic chip.  Chat voice keeps its
          existing prose chrome so the tool grammar never leaks into replies. */}
      <Show
        when={isTool()}
        fallback={
          <Show
            when={summary()}
            fallback={
              <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
                <Show
                  when={isChat() && kind() === "ask"}
                  fallback={
                    <Show when={isChat()}>
                      <box flexShrink={0}>
                        <text fg={labelColor()} wrapMode="none">{labelText()}</text>
                      </box>
                    </Show>
                  }
                >
                  <box flexShrink={0}>
                    <text fg={labelColor()} wrapMode="none">{labelText()}</text>
                  </box>
                </Show>
                <Show when={elapsedText()}>
                  <text fg={metaColor()} wrapMode="none">{` · ${elapsedText()}`}</text>
                </Show>
                <Show when={showTimestamp()}>
                  <text fg={metaColor()} wrapMode="none"> · {timestampText()}</text>
                </Show>
                {actorBox()}
                <box flexGrow={1} minWidth={0} />
              </box>
            }
          >
            <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start" gap={1}>
              <Show when={isChat() && kind() === "ask"} fallback={<box flexShrink={0}><text fg={labelColor()}>{labelText()}</text></box>}>
                <box flexShrink={0}><text fg={labelColor()} wrapMode="none">{labelText()}</text></box>
              </Show>
              {actorBox()}
              <Show when={thinking()}>
                <text fg={activityColor()} wrapMode="none">{thinking() || thinkChrome().verb}</text>
                <text fg={theme.spineDiffMuted} wrapMode="none">·</text>
              </Show>
              <box flexGrow={1} minWidth={0} flexShrink={1}>
                <text fg={summaryColor()} wrapMode="word">{summary()}</text>
              </box>
              <Show when={disclosure()}>
                <box flexShrink={0} onMouseUp={props.onDisclosureMouseUp}>
                  <text fg={summaryColor()} wrapMode="none">{disclosure()}</text>
                </box>
              </Show>
              <Show when={elapsedText()}>
                <box flexShrink={0}><text fg={metaColor()} wrapMode="none">{elapsedText()}</text></box>
              </Show>
              <Show when={showTimestamp()}>
                <box flexShrink={0}><text fg={metaColor()} wrapMode="none"> · {timestampText()}</text></box>
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
        <SpineToolChip
          kind={kind()}
          label={label()}
          summary={summary()}
          receipt={props.receipt}
          streaming={streaming()}
          elapsed={elapsedText()}
          disclosure={disclosure()}
          layout={layout()}
          contentWidth={props.contentWidth}
          onDisclosureMouseUp={props.onDisclosureMouseUp}
          onMouseUp={props.onDismiss ? () => props.onDismiss?.() : undefined}
        />
      </Show>
    </Show>
  )
}
