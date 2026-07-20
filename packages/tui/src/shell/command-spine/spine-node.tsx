import { For, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { SigilSpinner } from "../../component/sigil-spinner"
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
  const parts = () => props.summary.split(/\s+·\s+/).filter(Boolean)
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
  /** True while reasoning content is still streaming — shows animated sigil spinner. */
  streaming?: boolean
  /** Merged think verb for tool rows — shows inline after the tool glyph. */
  thinking?: string
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const tone = spineTone(props.kind, t)
  const label = (props.label ?? props.kind).trim()
  const isChat =
    props.kind === "ask" || props.kind === "plan" || props.kind === "ok"
  const isTool =
    props.kind === "inspect"
    || props.kind === "run"
    || props.kind === "patch"
    || props.kind === "fail"
    || props.kind === "agent"
  const labelWidth = isChat ? CHAT_LABEL_WIDTH : TOOL_LABEL_WIDTH
  const showLabel = !!label && props.layout !== "minimal" && props.kind !== "think"
  const summary = props.summary?.trim() ?? ""
  const actor = props.actor?.trim()
  const showActor = !!actor && (props.kind === "agent" || actor === "you")
  const elapsedText = compactSpineElapsed(props.elapsed, spineElapsedMax(props.layout))
  const summaryColor = () => {
    if (props.kind === "fail") return t.spineFail as any
    if (props.kind === "think") return t.spineThink as any
    // Assistant prose summary stays muted — full reply is in the body below
    if (isChat) return t.spineDiffMuted as any
    // Tool summaries stay readable but secondary to assistant voice
    if (isTool) return t.spineContext as any
    return t.text as any
  }
  const labelColor = () => {
    // Chat labels rarely render here (chat uses SpineChatCard); tools stay muted verbs.
    if (isChat) return (t.spineBrand ?? t.spineOk ?? t.accent ?? tone) as any
    // Tool verbs secondary so they never compete with the arcana card
    if (isTool) return (t.spineContext ?? t.textMuted ?? tone) as any
    return tone as any
  }
  const isThinkStreaming = () => props.kind === "think" && props.streaming === true
  const disclosure = props.disclosure ?? ""

  // Think / label-less rows: summary fills the line (+ optional chevron + elapsed).
  if (!showLabel) {
    const summaryBody = (
      <box flexGrow={1} minWidth={0} flexShrink={1}>
        <text fg={summaryColor()} wrapMode="word">
          {summary || " "}
          {disclosure ? ` ${disclosure}` : ""}
          {elapsedText ? (
            <span style={{ fg: t.spineGutterElapsed as any }}>{` · ${elapsedText}`}</span>
          ) : null}
        </text>
      </box>
    )
    return (
      <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
        <Show when={showActor}>
          <box flexShrink={0} width={props.kind === "agent" ? 12 : 5}>
            <text fg={t.spineActor as any}>
              {truncateActor(actor ?? "", props.kind === "agent" ? 12 : 5)}
            </text>
          </box>
        </Show>
        <Show when={props.thinking}>
          <box flexDirection="row" gap={1} flexShrink={0}>
            <ShimmerText text={summary || "Thinking"} active={true} background={t.backgroundPanel as any} />
            <text fg={t.spineDiffMuted as any}>·</text>
          </box>
        </Show>
        <Show
          when={isThinkStreaming()}
          fallback={summaryBody}
        >
          <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
            <ShimmerText text={summary || "Thinking"} active={true} background={t.backgroundPanel as any} />
            <Show when={elapsedText}>
              <text fg={t.spineGutterElapsed as any} wrapMode="none">{` · ${elapsedText}`}</text>
            </Show>
          </box>
        </Show>
      </box>
    )
  }

  // Label-only row (chat prose renders as markdown below).
  if (!summary) {
    return (
      <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
        <box flexShrink={0} width={isChat ? labelWidth : undefined}>
          <text fg={labelColor()} wrapMode="none">{isChat ? label.padEnd(labelWidth) : label}</text>
        </box>
        <Show when={elapsedText}>
          <text fg={t.spineGutterElapsed as any} wrapMode="none">{` · ${elapsedText}`}</text>
        </Show>
        <Show when={showActor}>
          <box flexShrink={0} width={props.kind === "agent" ? 12 : 5}>
            <text fg={t.spineActor as any}>
              {truncateActor(actor ?? "", props.kind === "agent" ? 12 : 5)}
            </text>
          </box>
        </Show>
        <box flexGrow={1} minWidth={0} />
      </box>
    )
  }

  if (props.layout === "minimal") {
    return (
      <box flexDirection="column" flexGrow={1} minWidth={0} flexShrink={1}>
        <text fg={isChat ? (t.spineOk as any) : summaryColor()} wrapMode="word">
          {isChat ? `${label}  ` : ""}
          {summary}
          {disclosure ? ` ${disclosure}` : ""}
        </text>
      </box>
    )
  }

  // Truncate long tool labels so they don't steal space from the path/summary.
  const truncatedLabel = label.length > labelWidth
    ? label.slice(0, labelWidth - 1) + "…"
    : label.padEnd(labelWidth)

  return (
    <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
      <box flexShrink={0} width={labelWidth}>
        <text fg={labelColor()}>{truncatedLabel}</text>
      </box>
      <Show when={showActor}>
        <box flexShrink={0} width={props.kind === "agent" ? 12 : 5}>
          <text fg={t.spineActor as any}>
            {truncateActor(actor ?? "", props.kind === "agent" ? 12 : 5)}
          </text>
        </box>
      </Show>
      <Show when={props.thinking}>
        <ShimmerText text={props.thinking || "Thinking"} active={true} background={t.backgroundPanel as any} />
        <text fg={t.spineDiffMuted as any}> · </text>
      </Show>
      <box flexGrow={1} minWidth={0} flexShrink={1}>
        <Show
          when={props.kind === "patch"}
          fallback={
            <text fg={summaryColor()} wrapMode="word">
              {summary}
              {disclosure ? ` ${disclosure}` : ""}
            </text>
          }
        >
          <PatchSummaryText summary={summary} disclosure={disclosure} theme={t} />
        </Show>
      </box>
      <Show when={elapsedText}>
        <box flexShrink={0}>
          <text fg={t.spineGutterElapsed as any} wrapMode="none">{` · ${elapsedText}`}</text>
        </box>
      </Show>
    </box>
  )
}
