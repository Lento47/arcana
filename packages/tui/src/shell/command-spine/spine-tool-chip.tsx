import { Show, createMemo, useContext, type JSX } from "solid-js"
import type { MouseEvent } from "@opentui/core"
import { ThemeContext } from "../../context/theme"
import type { Theme } from "../../theme"
import type { SpineKind, SpineLayout, SpineReceipt } from "./spine-types"
import { spineTone } from "./spine-types"
import { displayWidth, truncate } from "../../util/locale"
import { toolCategoryLabel, toolChipModel, type ToolChipLifecycle } from "./spine-chrome"

// InlineToolRow has historically been usable in isolated render tests and by
// plugin surfaces that do not mount ThemeProvider. Keep that contract while
// using the real palette whenever the provider is present.
const FALLBACK_CHIP_THEME = {
  backgroundElement: "#252a33",
  text: "#e6eaf0",
  textMuted: "#727b8b",
  accent: "#83a8d8",
  spineFail: "#d97777",
  warning: "#d6ad62",
  spineOk: "#8ab07a",
  spineRun: "#c58ad8",
  spineThink: "#b39ddb",
  spineContext: "#8d96a6",
  spineGutterElapsed: "#727b8b",
  spinePatch: "#d6ad62",
  spineSubagent: "#8fb4e8",
  spineAsk: "#d28bd2",
  spineInspect: "#83a8d8",
  info: "#83a8d8",
} as unknown as Theme

/**
 * Shared semantic tool chip.  The status/category cell is fixed and never
 * wraps; only the human-readable preview is allowed to shrink.  This keeps
 * the status marker attached to the operation on both OpenTUI shells.
 */
export function SpineToolChip(props: {
  kind: SpineKind | string
  label?: string
  summary?: string
  /** Optional rich summary used by the legacy shell's specialized tool copy. */
  children?: JSX.Element
  receipt?: SpineReceipt
  lifecycle?: ToolChipLifecycle
  streaming?: boolean
  elapsed?: string
  disclosure?: "▸" | "▾" | ""
  layout?: SpineLayout
  contentWidth?: number
  onMouseUp?: (event: MouseEvent) => void
  onDisclosureMouseUp?: (event: MouseEvent) => void
}) {
  const themeContext = useContext(ThemeContext)
  const theme = themeContext?.theme ?? FALLBACK_CHIP_THEME
  const layout = () => props.layout ?? "wide"
  const model = createMemo(() => toolChipModel({
    kind: String(props.kind),
    label: props.label,
    summary: props.summary,
    receipt: props.receipt,
    lifecycle: props.lifecycle,
    streaming: props.streaming,
  }))
  const summaryText = createMemo(() => model().summary)
  const hasRichSummary = createMemo(() => props.children !== undefined)
  const outcome = createMemo(() => model().outcome ?? "")
  const labelText = createMemo(() => {
    const max = layout() === "minimal" ? 8 : layout() === "narrow" ? 10 : 16
    return truncate(model().label, max)
  })
  const outcomeText = createMemo(() => {
    const value = outcome()
    if (!value) return ""
    const width = props.contentWidth
    const max = typeof width === "number" && Number.isFinite(width)
      ? Math.max(8, Math.min(36, Math.floor(width * 0.4)))
      : 48
    return truncate(value, max)
  })
  const elapsed = createMemo(() => (props.elapsed ?? "").trim())
  const disclosure = createMemo(() => props.disclosure ?? "")
  const showOutcome = createMemo(() => layout() !== "minimal" && !!outcomeText())
  const showElapsed = createMemo(() => layout() !== "minimal" && !!elapsed())
  const showDisclosure = createMemo(() => !!disclosure())
  const statusColor = createMemo(() => {
    switch (model().lifecycle) {
      case "failure":
        return theme.spineFail
      case "interrupted":
        return theme.warning
      case "success":
        return theme.spineOk
      case "running":
        return theme.spineRun
      default:
        return theme.spineContext
    }
  })
  const categoryColor = createMemo(() => {
    const category = toolCategoryLabel(String(props.kind))
    if (category === "run") return theme.spineRun
    if (category === "edit" || category === "patch") return theme.spinePatch
    if (category === "task" || category === "agent" || category === "report") return theme.spineSubagent
    if (category === "question") return theme.spineAsk
    if (category === "read" || category === "search" || category === "list" || category === "fetch" || category === "inspect") return theme.spineInspect
    return spineTone("think", theme)
  })

  // Reserve the non-wrapping cells before truncating the summary.  When a
  // caller cannot provide a measured width, the flex row still clips safely;
  // no fixed 80-column fallback is introduced here.
  const summaryBudget = createMemo(() => {
    const width = props.contentWidth
    if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return undefined
    const chipWidth = 2 + displayWidth(model().glyph) + 1 + displayWidth(labelText())
    const outcomeWidth = showOutcome() ? 3 + displayWidth(outcomeText()) : 0
    const elapsedWidth = showElapsed() ? 3 + displayWidth(elapsed()) : 0
    const disclosureWidth = showDisclosure() ? displayWidth(disclosure()) + 1 : 0
    // The preview container has one leading column of breathing room in
    // addition to the status pill and optional right-side metadata.
    const previewPadding = summaryText() || hasRichSummary() ? 1 : 0
    const separator = summaryText() ? 1 : 0
    return Math.max(1, Math.floor(width - chipWidth - previewPadding - outcomeWidth - elapsedWidth - disclosureWidth - separator))
  })
  const preview = createMemo(() => {
    const text = summaryText()
    const budget = summaryBudget()
    return budget === undefined ? text : truncate(text, budget)
  })

  return (
    <box
      flexDirection="row"
      alignItems="flex-start"
      flexGrow={1}
      minWidth={0}
      flexShrink={1}
      overflow="hidden"
      onMouseUp={props.onMouseUp}
    >
      <box
        flexShrink={0}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={theme.backgroundElement}
      >
        <text wrapMode="none">
          <span style={{ fg: statusColor() }}>{model().glyph}</span>
          <span style={{ fg: categoryColor() }}> {labelText()}</span>
        </text>
      </box>
      <Show when={preview() || hasRichSummary()}>
        <box flexDirection="row" flexGrow={1} minWidth={0} flexShrink={1} overflow="hidden" paddingLeft={1}>
          <Show
            when={hasRichSummary()}
            fallback={<text fg={theme.text} wrapMode="none" truncate>{preview()}</text>}
          >
            <text fg={theme.text} wrapMode="none" truncate>{props.children}</text>
          </Show>
        </box>
      </Show>
      <Show when={showOutcome()}>
        <text fg={statusColor()} wrapMode="none" truncate> · {outcomeText()}</text>
      </Show>
      <Show when={showDisclosure()}>
        <box flexShrink={0} onMouseUp={props.onDisclosureMouseUp}>
          <text fg={theme.spineContext} wrapMode="none"> {disclosure()}</text>
        </box>
      </Show>
      <Show when={showElapsed()}>
        <text fg={theme.spineGutterElapsed} wrapMode="none"> · {elapsed()}</text>
      </Show>
    </box>
  )
}
