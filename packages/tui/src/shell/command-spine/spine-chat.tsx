import { Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { APP_NAME, Glyph } from "../../branding"
import { SigilSpinner } from "../../component/sigil-spinner"
import { ShimmerText } from "../../component/shimmer-text"
import {
  compactSpineElapsed,
  spineElapsedMax,
  spineRailWidth,
  spineTone,
  type SpineKind,
  type SpineLayout,
} from "./spine-types"
import { SpineProse } from "./spine-prose"

/**
 * Grok-style chat voice block.
 *
 * CRITICAL layout rule (proven against mid-word wrap):
 * Legacy session TextPart works because markdown sits in a SINGLE column with
 * paddingLeft — NOT a row of [rail | markdown]. A rail sibling + width% war
 * collapses wrap width. Body uses pad-as-rail + numeric contentWidth.
 */
export function SpineChatCard(props: {
  kind: SpineKind
  label?: string
  text: string
  layout: SpineLayout
  elapsed?: string
  timestamp?: string
  streaming?: boolean
  focused?: boolean
  reminders?: string[]
  bodyLabel?: string
  /** Full measured wrap width for the answer body (terminal − gutters). */
  contentWidth?: number
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>

  const kind = () => props.kind
  const isUser = createMemo(() => kind() === "ask")
  const isAssistant = createMemo(() => kind() === "plan" || kind() === "ok")
  const streaming = createMemo(() => props.streaming === true)
  const text = createMemo(() => props.text ?? "")
  const focused = () => props.focused === true
  const showTimeChrome = createMemo(() => props.layout !== "minimal")
  const elapsedText = createMemo(() => {
    if (!showTimeChrome() || !isAssistant()) return ""
    return compactSpineElapsed(props.elapsed, spineElapsedMax(props.layout))
  })
  const timestampText = createMemo(() => {
    if (!showTimeChrome()) return ""
    return (props.timestamp ?? "").trim()
  })
  const hasRightTime = createMemo(() => !!(elapsedText() || timestampText()))

  const speaker = createMemo(() => {
    if (isUser()) return "you"
    const raw = (props.label ?? "").trim().toLowerCase()
    if (raw && raw !== "assistant" && raw !== "plan" && raw !== "ok" && raw !== "coda" && raw !== "insight") {
      return raw
    }
    return APP_NAME
  })

  const speakerColor = createMemo(() => {
    if (isUser()) return (t.spineAsk ?? t.accent ?? spineTone("ask", t)) as any
    return (t.spineBrand ?? t.primary ?? t.spineOk ?? spineTone("ok", t)) as any
  })

  const railColor = createMemo(() => speakerColor())
  const timeColor = createMemo(() => (t.spineGutterElapsed ?? t.textMuted) as any)
  const railW = createMemo(() => spineRailWidth(props.layout))

  const cardBg = createMemo(() => {
    if (!isAssistant()) return undefined
    return (t.backgroundPanel ?? t.backgroundElement) as any
  })

  const bodyLabel = createMemo(
    () => props.bodyLabel ?? (isUser() ? "prompt" : "assistant"),
  )

  // Explicit wrap width — never leave markdown to Yoga % guesswork.
  const bodyWidth = createMemo(() => {
    if (typeof props.contentWidth === "number" && props.contentWidth >= 24) {
      return Math.floor(props.contentWidth)
    }
    return undefined
  })

  const shimmerVerb = createMemo(() => {
    if (kind() === "plan") return "thinking"
    return "writing"
  })

  const accentGlyph = createMemo(() => (isUser() ? Glyph.diamond : Glyph.star))

  return (
    <box
      flexDirection="column"
      flexShrink={0}
      width={bodyWidth() ?? ("100%" as any)}
      minWidth={0}
      marginTop={isAssistant() ? 1 : 0}
      marginBottom={1}
      backgroundColor={cardBg()}
      border={isAssistant() ? ["left"] : undefined}
      borderColor={isAssistant() ? railColor() : undefined}
      paddingLeft={isAssistant() ? 3 : 1}
      paddingRight={1}
      paddingTop={isAssistant() ? 1 : 0}
      paddingBottom={isAssistant() ? 1 : 0}
    >
      {/* Turn separator — thin line above user messages */}
      <Show when={isUser()}>
        <box border={["bottom"]} borderColor={(t.borderSubtle ?? t.textMuted) as any} width="100%" />
      </Show>
      {/* Header — single row, no markdown here */}
      <box flexDirection="row" flexShrink={0} alignItems="center" width="100%">
        <box flexDirection="row" flexShrink={0} alignItems="center" gap={1}>
          <text fg={speakerColor()} wrapMode="none">
            {accentGlyph()} {speaker()}
          </text>
          <Show when={streaming()} keyed>
            <SigilSpinner color={speakerColor()} />
          </Show>
          <Show when={streaming() && !elapsedText()} keyed>
            <ShimmerText
              text={shimmerVerb()}
              active={true}
              background={(cardBg() ?? t.background) as any}
            />
          </Show>
        </box>
        <box flexGrow={1} minWidth={1} />
        <Show when={hasRightTime()}>
          <box flexDirection="row" flexShrink={0} alignItems="center" gap={1}>
            <Show when={elapsedText()}>
              <text fg={timeColor()} wrapMode="none">
                {elapsedText()}
              </text>
            </Show>
            <Show when={timestampText()}>
              <text fg={timeColor()} wrapMode="none">
                {timestampText()}
              </text>
            </Show>
          </box>
        </Show>
      </box>

      {/*
        BODY — exact legacy TextPart pattern:
        flexShrink={0} minWidth={0} [optional numeric width] + markdown.
        NO rail sibling. Accent is the card left border only.
      */}
      <box
        flexShrink={0}
        minWidth={0}
        width={bodyWidth() ?? ("100%" as any)}
        marginTop={1}
        paddingLeft={0}
      >
        <SpineProse
          kind={kind()}
          text={text()}
          contentWidth={bodyWidth()}
          bodyLabel={bodyLabel()}
          streaming={streaming()}
          focused={focused()}
          reminders={props.reminders}
          chatVoice
        />
      </box>
    </box>
  )
}
