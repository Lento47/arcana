import { For, Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { spineOuterPadding, type SpineLayout, type StatusSegment, statusToneColor } from "./spine-types"

function truncateValue(value: string, max: number): string {
  if (value.length <= max) return value
  if (max <= 1) return "…"
  return value.slice(0, max - 1).trimEnd() + "…"
}

function valueLimit(segment: StatusSegment, layout: SpineLayout): number {
  if (segment.key === "path") {
    if (layout === "wide") return 54
    if (layout === "compact") return 42
    return 0
  }
  if (segment.key === "model") {
    if (layout === "wide") return 22
    if (layout === "compact") return 18
    return 14
  }
  if (segment.key === "branch") return layout === "wide" ? 18 : 14
  if (segment.key === "agent") return layout === "wide" ? 14 : 11
  if (segment.key === "session") return layout === "wide" ? 10 : 9
  if (segment.key === "state") return 9
  if (segment.key === "ctx") return 8
  return layout === "wide" ? 16 : 12
}

function SegmentView(props: {
  segment: StatusSegment
  divider?: boolean
  theme: Record<string, unknown>
  layout: SpineLayout
}) {
  const color = statusToneColor(props.segment.tone, props.theme)
  const value = createMemo(() => truncateValue(props.segment.value, valueLimit(props.segment, props.layout)))

  return (
    <>
      <Show when={props.divider}>
        <text fg={props.theme.borderSubtle as any}> · </text>
      </Show>
      <text fg={color as any}>{value()}</text>
    </>
  )
}

function prioritizeSegments(segments: StatusSegment[], layout: SpineLayout): StatusSegment[] {
  const primary = segments.filter((s) => s.key !== "path" && s.key !== "tok" && s.key !== "proj" && s.key !== "mode")
  const order = new Map(["branch", "agent", "model", "ctx", "state", "session"].map((key, index) => [key, index]))
  const ranked = [...primary].sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
  if (layout === "minimal")
    return ranked
      .filter((s) => s.key === "agent" || s.key === "model" || s.key === "state" || s.key === "ctx")
      .slice(0, 2)
  if (layout === "narrow") return ranked.filter((s) => s.key !== "session").slice(0, 3)
  if (layout === "compact") return ranked.slice(0, 4)
  return ranked.slice(0, 5)
}

export function SpineHeader(props: {
  layout: SpineLayout
  segments: StatusSegment[]
  session: () => { id: string; title?: string } | undefined
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const pad = createMemo(() => spineOuterPadding(props.layout))
  const isWide = createMemo(() => props.layout === "wide")
  const isMinimal = createMemo(() => props.layout === "minimal")
  const isCompact = createMemo(() => props.layout === "compact")
  const showBrand = createMemo(() => !isMinimal())
  const segments = createMemo(() => prioritizeSegments(props.segments, props.layout))
  const pathSegment = createMemo(() => props.segments.find((segment) => segment.key === "path"))
  const showPath = createMemo(() => !!pathSegment() && (isWide() || isCompact()))

  const SegmentList = () => (
    <box flexDirection="row" minWidth={0} overflow="hidden">
      <For each={segments()}>
        {(seg, i) => <SegmentView segment={seg} divider={i() > 0} theme={t} layout={props.layout} />}
      </For>
    </box>
  )

  const PathLine = () => (
    <Show when={showPath()}>
      <box flexDirection="row" paddingLeft={pad()} paddingRight={pad()}>
        <Show when={isWide()}>
          <box flexGrow={1} />
        </Show>
        <text fg={t.spineContext as any}>
          {truncateValue(pathSegment()!.value, valueLimit(pathSegment()!, props.layout))}
        </text>
      </box>
    </Show>
  )

  // Tight header: no blank row above brand; one separator only when context rows exist.
  const hasContext = createMemo(() => segments().length > 0 || showPath())

  return (
    <box flexDirection="column" flexShrink={0}>
      <Show
        when={isWide()}
        fallback={
          <>
            <Show when={showBrand()}>
              <box flexDirection="row" paddingLeft={pad()} paddingRight={pad()}>
                <text fg={t.spineBrand as any}>A R C A N A</text>
              </box>
            </Show>
            <Show when={segments().length > 0}>
              <box flexDirection="row" paddingLeft={pad()} paddingRight={pad()}>
                <SegmentList />
              </box>
            </Show>
            <PathLine />
          </>
        }
      >
        <box flexDirection="row" paddingLeft={pad()} paddingRight={pad()}>
          <text fg={t.spineBrand as any}>A R C A N A</text>
          <box flexGrow={1} />
          <Show when={segments().length > 0}>
            <SegmentList />
          </Show>
        </box>
        <PathLine />
      </Show>
      <Show when={hasContext() || showBrand()}>
        <box height={1} />
        <box border={["bottom"]} borderColor={t.borderSubtle as any} marginBottom={1} />
      </Show>
    </box>
  )
}
