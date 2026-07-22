import { Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { APP_NAME, Glyph } from "../../branding"
import { SigilSpinner } from "../../component/sigil-spinner"
import { ShimmerText } from "../../component/shimmer-text"
import {
  compactSpineElapsed,
  spineElapsedMax,
  spineTone,
  type SpineKind,
  type SpineLayout,
} from "./spine-types"
import { SpineProse } from "./spine-prose"
import { SpineRail } from "./spine-rail"

/**
 * Grok-style chat voice block — not a tool row.
 *
 * User: sticky-header feel (diamond + you).
 * Assistant: brand star + product name, soft panel, full markdown body.
 * Tools stay outside this component (compact label + path).
 *
 * Streaming chrome (spinner + "writing") is driven by a reactive memo so it
 * always stops when the parent flips streaming=false (idle/finish/completed).
 */
export function SpineChatCard(props: {
  kind: SpineKind
  label?: string
  text: string
  layout: SpineLayout
  /** Turn duration, e.g. "+23s" — muted on the right (assistant only). */
  elapsed?: string
  /** Wall-clock time for the message. Right-aligned like Grok Build. */
  timestamp?: string
  streaming?: boolean
  focused?: boolean
  reminders?: string[]
  bodyLabel?: string
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>

  const kind = () => props.kind
  const isUser = createMemo(() => kind() === "ask")
  const isAssistant = createMemo(() => kind() === "plan" || kind() === "ok")
  /** Reactive — must re-read every time props.streaming flips. */
  const streaming = createMemo(() => props.streaming === true)
  const text = createMemo(() => props.text ?? "")
  const focused = () => props.focused === true
  // Hide duration/clock chrome on minimal layouts (too narrow — avoids wrap collision).
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

  const glyph = createMemo(() => (isUser() ? Glyph.diamond : Glyph.star))

  const speakerColor = createMemo(() => {
    if (isUser()) return (t.spineAsk ?? t.accent ?? spineTone("ask", t)) as any
    return (t.spineBrand ?? t.primary ?? t.spineOk ?? spineTone("ok", t)) as any
  })

  const railColor = createMemo(() => speakerColor())
  const timeColor = createMemo(() => (t.spineGutterElapsed ?? t.textMuted) as any)

  // Soft card behind assistant prose; user stays on the page background.
  const cardBg = createMemo(() => {
    if (!isAssistant()) return undefined
    if (focused()) return (t.backgroundElement ?? t.backgroundPanel) as any
    return (t.backgroundPanel ?? t.backgroundElement) as any
  })

  const bodyLabel = createMemo(
    () => props.bodyLabel ?? (isUser() ? "prompt" : "assistant"),
  )

  return (
    <box
      flexDirection="row"
      flexShrink={0}
      flexGrow={1}
      width="100%"
      minWidth={0}
      alignItems="flex-start"
      marginTop={isAssistant() ? 1 : 0}
      marginBottom={1}
    >
      <SpineRail
        layout={props.layout}
        kind={kind()}
        glyph={glyph()}
        color={railColor()}
        active={focused()}
      />
      <box
        flexGrow={1}
        minWidth={0}
        flexShrink={1}
        width="100%"
        flexDirection="column"
        backgroundColor={cardBg()}
        border={isAssistant() ? ["left"] : undefined}
        borderColor={isAssistant() ? railColor() : undefined}
        paddingLeft={isAssistant() ? 2 : 1}
        paddingRight={1}
        paddingTop={isAssistant() ? 1 : 0}
        paddingBottom={isAssistant() ? 1 : 0}
      >
        {/* Header: speaker left · Grok-style wall clock / duration right */}
        <box flexDirection="row" flexShrink={0} alignItems="center" width="100%">
          <box flexDirection="row" flexShrink={0} alignItems="center" gap={1}>
            <text fg={speakerColor()} wrapMode="none">
              {speaker()}
            </text>
            <Show when={streaming()} keyed>
              <SigilSpinner color={speakerColor()} />
            </Show>
            <Show when={streaming() && !elapsedText()} keyed>
              <ShimmerText
                text="writing"
                active={true}
                background={(cardBg() ?? t.background) as any}
              />
            </Show>
          </box>
          {/* Spacer pushes time to the trailing edge (Grok right-align). */}
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

        {/* Full prose body — must take remaining width or wrap collapses to 1 cell */}
        <box flexGrow={1} minWidth={0} flexShrink={1} width="100%" marginTop={1}>
          <SpineProse
            kind={kind()}
            text={text()}
            bodyLabel={bodyLabel()}
            streaming={streaming()}
            focused={focused()}
            reminders={props.reminders}
            chatVoice
          />
        </box>
      </box>
    </box>
  )
}
