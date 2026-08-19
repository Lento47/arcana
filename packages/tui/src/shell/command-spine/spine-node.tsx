import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useTheme } from "../../context/theme"
import type { Theme } from "../../theme"
import { ShimmerText } from "../../component/shimmer-text"
import { displayWidth, truncate } from "../../util/locale"
import {
  compactSpineElapsed,
  formatElapsedMs,
  spineElapsedMax,
  spineTone,
  type SpineKind,
  type SpineLayout,
} from "./spine-types"
import { SPINNER_FRAMES_BRAILLE_FLOW } from "../../util/spinner-style"
import { streamTextCue, thinkingRowChrome, toolChipChrome } from "./spine-chrome"

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

function PatchSummaryText(props: { summary: string; disclosure: string; theme: Theme }) {
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
      <Show when={props.disclosure}>
        <span style={{ fg: props.theme.spineDiffMuted }}> {props.disclosure}</span>
      </Show>
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
 * All props are read through accessors/memos so streaming chrome (spinner,
 * shimmer "Thinking") and summary text update without remounting the row.
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
  /** True while reasoning content is still streaming — shows animated shimmer. */
  streaming?: boolean
  /** Merged think verb for tool rows — shows inline after the tool glyph. */
  thinking?: string
}) {
  const { theme } = useTheme()

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
  // Animated braille frame for live rows. Uses a manual 150ms interval driven
  // by a client-only effect (skipped in the server renderer) so the chip spins
  // in the live app without destabilizing frame capture in tests.
  const [tick, setTick] = createSignal(0)
  createEffect(() => {
    if (!live()) return
    const timer = setInterval(() => setTick((n) => n + 1), 150)
    onCleanup(() => clearInterval(timer))
  })
  const spinnerGlyph = createMemo(() => {
    if (!live()) return ""
    const frames = SPINNER_FRAMES_BRAILLE_FLOW
    return frames[Math.floor(tick() / 2) % frames.length] ?? "⠋"
  })
  const elapsedText = createMemo(() => {
    const max = spineElapsedMax(props.layout)
    if (live()) {
      void tick() // track the interval signal
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
  const isThink = createMemo(() => kind() === "think")
  const isThinkStreaming = createMemo(() => isThink() && streaming())

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
  const streamCue = createMemo(() => streamTextCue(streaming()))
  const tone = createMemo(() => spineTone(kind(), theme))
  const summaryColor = createMemo(() => {
    if (kind() === "fail") return theme.spineFail
    if (kind() === "think") return theme.spineThink
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

  const metaStrip = createMemo(() => nodeMetaStrip(disclosure(), elapsedText()))

  // M1: the wrapping text node carries ONLY the summary; the chevron + elapsed
  // render in a flexShrink={0} sibling so a wrapped summary can never strand
  // meta alone on its own line. No flexGrow on the summary box: meta follows
  // the content (not pinned to the right edge), so it stays visually identical
  // to the pre-fix inline position and to the sibling isThinkStreaming path.
  const summaryBody = () => (
    <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
      <box flexShrink={1} minWidth={0}>
        <text fg={summaryColor()} wrapMode="word">
          {summary() || " "}
        </text>
      </box>
      <Show when={metaStrip().length > 0}>
        <box flexShrink={0}>
          <text wrapMode="none">
            <For each={metaStrip()}>
              {(part) => (
                <span
                  style={{
                    fg: part.tone === "summary" ? summaryColor() : theme.spineGutterElapsed,
                  }}
                >
                  {part.text}
                </span>
              )}
            </For>
          </text>
        </box>
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
                  <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement} flexShrink={0}>
                    <ShimmerText
                      text={summary() || thinkChrome().verb}
                      active={streaming() || !!thinking()}
                      background={theme.backgroundElement}
                    />
                  </box>
                  <Show when={streamCue().badge}>
                    <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement} flexShrink={0}>
                      <text fg={theme.accent} wrapMode="none">{streamCue().badge}</text>
                    </box>
                  </Show>
                  <text fg={theme.spineDiffMuted}>·</text>
                </box>
              </Show>
              <Show when={isThinkStreaming()} fallback={summaryBody()}>
                <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start" gap={1}>
                  <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement} flexShrink={0}>
                    <ShimmerText
                      text={summary() || thinkChrome().verb}
                      active={true}
                      background={theme.backgroundElement}
                    />
                  </box>
                  <Show when={thinkChrome().badge}>
                    <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement} flexShrink={0}>
                      <text fg={theme.accent} wrapMode="none">{thinkChrome().badge}</text>
                    </box>
                  </Show>
                  <Show when={elapsedText()}>
                    <text fg={theme.spineGutterElapsed} wrapMode="none">{elapsedText()}</text>
                  </Show>
                </box>
              </Show>
            </box>
          }
        >
          <box flexDirection="column" flexGrow={1} minWidth={0} flexShrink={1}>
            <text fg={isChat() ? theme.spineOk : summaryColor()} wrapMode="word">
              {isChat() ? `${label()}  ` : ""}
              {summary()}
              {disclosure() ? ` ${disclosure()}` : ""}
            </text>
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
            <box
              flexShrink={0}
              width={labelWidth()}
              backgroundColor={theme.backgroundElement}
              border={["left"]}
              borderColor={chip().status === "fail" ? theme.spineFail : chip().status === "live" ? theme.accent : theme.spineOk}
            >
              {/* Subagent block: animated braille spinner + agent name while delegated.
                  Inline frames (not the Spinner component) so the server renderer
                  stays stable — no opentui-spinner element in the chip. */}
              <Show
                  when={kind() === "agent" && live()}
                  fallback={
                    <text
                      fg={chip().status === "fail" ? theme.spineFail : chip().status === "live" ? theme.accent : labelColor()}
                      wrapMode="none"
                    >
                      {chip().glyph} {chipLabel()}
                    </text>
                  }
                >
                  <text
                    fg={chip().status === "live" ? theme.accent : labelColor()}
                    wrapMode="none"
                  >
                    {spinnerGlyph()} {chipLabel()}
                  </text>
                </Show>
            </box>
          </Show>
          {actorBox()}
          <Show when={thinking()}>
            <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement} flexShrink={0}>
              <ShimmerText
                text={thinking() || thinkChrome().verb}
                active={streaming()}
                background={theme.backgroundElement}
              />
            </box>
            <Show when={streamCue().badge}>
              <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement} flexShrink={0}>
                <text fg={theme.accent} wrapMode="none">{streamCue().badge}</text>
              </box>
            </Show>
            <text fg={theme.spineDiffMuted} wrapMode="none">·</text>
          </Show>
          <box flexGrow={1} minWidth={0} flexShrink={1}>
            <Show
              when={kind() === "patch"}
              fallback={
                <text fg={summaryColor()} wrapMode="word">
                  {summary()}
                  {disclosure() ? ` ${disclosure()}` : ""}
                </text>
              }
            >
              <PatchSummaryText summary={summary()} disclosure={disclosure()} theme={theme} />
            </Show>
          </box>
          <Show when={elapsedText()}>
            <box flexShrink={0}>
              <text fg={theme.spineGutterElapsed} wrapMode="none">{elapsedText()}</text>
            </box>
          </Show>
        </box>
      </Show>
    </Show>
  )
}
