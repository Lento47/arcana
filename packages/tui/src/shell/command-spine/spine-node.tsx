import { For, Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { ShimmerText } from "../../component/shimmer-text"
import {
  compactSpineElapsed,
  spineElapsedMax,
  spineTone,
  type SpineKind,
  type SpineLayout,
} from "./spine-types"

/** Max characters for the tool label column (short verbs: search, read, run). */
const TOOL_LABEL_WIDTH = 7
/** Wider column for chat voice so "assistant" / "you" are not truncated. */
const CHAT_LABEL_WIDTH = 10

function patchSummaryColor(part: string, index: number, theme: Record<string, unknown>) {
  if (part.startsWith("+")) return theme.spineDiffAdd as any
  if (part.startsWith("-")) return theme.spineDiffRemove as any
  if (part === "diff") return theme.spineOk as any
  if (part.includes("unavailable") || part.includes("incomplete") || part.includes("file-list only")) return theme.warning as any
  return index === 0 ? (theme.spineDiffMuted as any) : (theme.text as any)
}

function PatchSummaryText(props: { summary: string; disclosure: string; theme: Record<string, unknown> }) {
  const parts = createMemo(() => props.summary.split(/\s+·\s+/).filter(Boolean))
  return (
    <text wrapMode="word">
      <For each={parts()}>
        {(part, index) => (
          <>
            <Show when={index() > 0}>
              <span style={{ fg: props.theme.spineDiffMuted as any }}> · </span>
            </Show>
            <span style={{ fg: patchSummaryColor(part, index(), props.theme) }}>{part}</span>
          </>
        )}
      </For>
      <Show when={props.disclosure}>
        <span style={{ fg: props.theme.spineDiffMuted as any }}> {props.disclosure}</span>
      </Show>
    </text>
  )
}

/** Truncate actor name with ellipsis when it exceeds the column width. */
function truncateActor(name: string, width: number): string {
  if (name.length <= width) return name.padEnd(width)
  return name.slice(0, width - 1) + "…"
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
  /** Optional disclosure chevron for collapsible rows (e.g. thinking). */
  disclosure?: "▸" | "▾" | ""
  /** True while reasoning content is still streaming — shows animated shimmer. */
  streaming?: boolean
  /** Merged think verb for tool rows — shows inline after the tool glyph. */
  thinking?: string
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>

  const kind = () => props.kind
  const layout = () => props.layout
  const label = createMemo(() => (props.label ?? props.kind).trim())
  const summary = createMemo(() => props.summary?.trim() ?? "")
  const actor = createMemo(() => props.actor?.trim() ?? "")
  const disclosure = createMemo(() => props.disclosure ?? "")
  const thinking = createMemo(() => props.thinking)
  const elapsedText = createMemo(() => compactSpineElapsed(props.elapsed, spineElapsedMax(props.layout)))
  const streaming = createMemo(() => props.streaming === true)

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
    return layout() === "minimal" ? 7 : 10
  })
  const showLabel = createMemo(
    () => !!label() && layout() !== "minimal" && kind() !== "think",
  )
  const showActor = createMemo(() => !!actor() && (kind() === "agent" || actor() === "you"))

  const tone = createMemo(() => spineTone(kind(), t))
  const summaryColor = createMemo(() => {
    if (kind() === "fail") return t.spineFail as any
    if (kind() === "think") return t.spineThink as any
    if (isChat()) return t.spineDiffMuted as any
    if (isTool()) return t.text as any
    return t.text as any
  })
  const labelColor = createMemo(() => {
    if (isChat()) return (t.spineBrand ?? t.spineOk ?? t.accent ?? tone()) as any
    if (isTool()) return (t.spineContext ?? t.textMuted ?? tone()) as any
    return tone() as any
  })

  const truncatedLabel = createMemo(() => {
    const raw = label()
    const w = labelWidth()
    if (raw.length > w) return raw.slice(0, w - 1) + "…"
    return raw
  })

  const summaryBody = () => (
    <box flexGrow={1} minWidth={0} flexShrink={1}>
      <text fg={summaryColor()} wrapMode="word">
        {summary() || " "}
        {disclosure() ? ` ${disclosure()}` : ""}
        <Show when={elapsedText()}>
          <span style={{ fg: t.spineGutterElapsed as any }}>{` · ${elapsedText()}`}</span>
        </Show>
      </text>
    </box>
  )

  const actorBox = () => (
    <Show when={showActor()}>
      <box flexShrink={0} width={kind() === "agent" ? 12 : 5}>
        <text fg={t.spineActor as any}>
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
                <box flexDirection="row" gap={1} flexShrink={0}>
                  <ShimmerText
                    text={summary() || "Thinking"}
                    active={streaming() || !!thinking()}
                    background={t.backgroundPanel as any}
                  />
                  <text fg={t.spineDiffMuted as any}>·</text>
                </box>
              </Show>
              <Show when={isThinkStreaming()} fallback={summaryBody()}>
                <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
                  <ShimmerText
                    text={summary() || "Thinking"}
                    active={true}
                    background={t.backgroundPanel as any}
                  />
                  <Show when={elapsedText()}>
                    <text fg={t.spineGutterElapsed as any} wrapMode="none">{` · ${elapsedText()}`}</text>
                  </Show>
                </box>
              </Show>
            </box>
          }
        >
          <box flexDirection="column" flexGrow={1} minWidth={0} flexShrink={1}>
            <text fg={isChat() ? (t.spineOk as any) : summaryColor()} wrapMode="word">
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
              <text fg={t.spineGutterElapsed as any} wrapMode="none">{` · ${elapsedText()}`}</text>
            </Show>
            {actorBox()}
            <box flexGrow={1} minWidth={0} />
          </box>
        }
      >
        <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
          <box flexShrink={0} width={labelWidth()}>
            <text fg={labelColor()}>{truncatedLabel()}</text>
          </box>
          {actorBox()}
          <Show when={thinking()}>
            <ShimmerText
              text={thinking() || "Thinking"}
              active={!!thinking()}
              background={t.backgroundPanel as any}
            />
            <text fg={t.spineDiffMuted as any}> · </text>
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
              <PatchSummaryText summary={summary()} disclosure={disclosure()} theme={t} />
            </Show>
          </box>
          <Show when={elapsedText()}>
            <box flexShrink={0}>
              <text fg={t.spineGutterElapsed as any} wrapMode="none">{` · ${elapsedText()}`}</text>
            </box>
          </Show>
        </box>
      </Show>
    </Show>
  )
}
