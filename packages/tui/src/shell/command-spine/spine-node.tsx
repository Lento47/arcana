import { Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { SigilSpinner } from "../../component/sigil-spinner"
import { ShimmerText } from "../../component/shimmer-text"
import { spineTone, type SpineKind, type SpineLayout } from "./spine-types"

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
  const showLabel = !!label && props.layout !== "minimal" && props.kind !== "think"
  const summary = props.summary?.trim() ?? ""
  const actor = props.actor?.trim()
  const showActor = !!actor && (props.kind === "agent" || actor === "you")
  const summaryColor = () => {
    if (props.kind === "fail") return t.spineFail as any
    if (props.kind === "think") return t.spineThink as any
    return t.text as any
  }
  const isThinkStreaming = () => props.kind === "think" && props.streaming === true
  const disclosure = props.disclosure ?? ""

  // Think / label-less rows: summary fills the line (+ optional chevron).
  if (!showLabel) {
    const summaryBody = (
      <box flexGrow={1} minWidth={0} flexShrink={1}>
        <text fg={summaryColor()} wrapMode="word">
          {summary || " "}
          {disclosure ? ` ${disclosure}` : ""}
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
        <Show when={isThinkStreaming()} fallback={summaryBody}>
          <ShimmerText text={summary || "Thinking"} active={true} background={t.backgroundPanel as any} />
        </Show>
      </box>
    )
  }

  // Label-only row (chat prose renders as markdown below).
  if (!summary) {
    return (
      <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
        <box flexShrink={0} width={12}>
          <text fg={tone as any}>{(label + " ·").padEnd(12).slice(0, 12)}</text>
        </box>
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
        <text fg={summaryColor()} wrapMode="word">
          {summary}
          {disclosure ? ` ${disclosure}` : ""}
        </text>
      </box>
    )
  }

  return (
    <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} alignItems="flex-start">
      <box flexShrink={0} width={8}>
        <text fg={tone as any}>{label.padEnd(8).slice(0, 8)}</text>
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
        <text fg={summaryColor()} wrapMode="word">
          {summary}
          {disclosure ? ` ${disclosure}` : ""}
        </text>
      </box>
    </box>
  )
}
