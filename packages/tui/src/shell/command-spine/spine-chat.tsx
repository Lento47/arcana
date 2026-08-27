import { Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { APP_NAME, Glyph } from "../../branding"
import {
  compactSpineElapsed,
  SPINE_CHAT_CARD_CHROME,
  spineElapsedMax,
  spineRailCell,
  spineRailWidth,
  type SpineKind,
  type SpineLayout,
} from "./spine-types"
import { SpineProse } from "./spine-prose"
import { chatCardChrome } from "./spine-chrome"

/**
 * Conversation voice — one column, one accent line.
 *
 *   [┃][pad 2][ ✦ speaker  live               +1.2s ]
 *   [┃][pad 2][ prose…                                   ]
 *
 * CRITICAL wrap rule: markdown sits in a SINGLE column with paddingLeft —
 * never a row of [rail | markdown]. A rail sibling + width% collapses wrap.
 * The left accent is the card border; the glyph occupies a 2-col rail cell
 * so it lines up with tool glyphs in the same content column.
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
  /** Measured wrap width for the answer body (terminal − gutters − card chrome). */
  contentWidth?: number
}) {
  const { theme } = useTheme()

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
    // User prompts drop the speaker label entirely: the user already knows
    // they sent the message, and rendering "you" beside the prompt text
    // duplicates that knowledge. The ◆ glyph remains as the row marker so
    // turn boundaries still read. Assistant turns keep the brand/name so
    // attribution is unambiguous on multi-agent sessions.
    if (isUser()) return ""
    const raw = (props.label ?? "").trim().toLowerCase()
    if (raw && raw !== "assistant" && raw !== "plan" && raw !== "ok" && raw !== "coda" && raw !== "insight") {
      return raw
    }
    return APP_NAME
  })

  const speakerColor = createMemo(() => {
    if (isUser()) return theme.spineAsk
    return theme.spineBrand
  })
  const chrome = createMemo(() =>
    chatCardChrome({ speaker: speaker(), streaming: streaming(), isUser: isUser() }),
  )

  const lineColor = createMemo(() => {
    if (focused()) return theme.accent
    return speakerColor()
  })
  const timeColor = createMemo(() => theme.spineGutterElapsed)
  const railW = createMemo(() => spineRailWidth(props.layout))
  const accentGlyph = createMemo(() => (isUser() ? Glyph.diamond : Glyph.star))
  const glyphCell = createMemo(() => spineRailCell(accentGlyph(), railW()))

  // Assistant prose stays open on the session surface. User prompts retain a
  // faint fill so turn boundaries remain clear without becoming chat bubbles.
  const cardBg = createMemo(() => (isUser() ? theme.backgroundElement : undefined))

  const bodyLabel = createMemo(
    () => props.bodyLabel ?? (isUser() ? "prompt" : "assistant"),
  )

  // Explicit wrap width — never leave markdown to Yoga % guesswork.
  // Present-but-narrow width is a real budget: clamp to >= 1 rather than
  // returning "100%" (which would re-open the 80-fallback in SpineProse.wrapCols).
  // Missing width (first paint) -> undefined: card sizes naturally, no floor.
  const bodyWidth = createMemo(() => {
    if (typeof props.contentWidth === "number" && Number.isFinite(props.contentWidth)) {
      return Math.max(1, Math.floor(props.contentWidth))
    }
    return undefined
  })

  return (
    <box
      flexDirection="column"
      flexShrink={0}
      width="100%"
      minWidth={0}
      marginTop={isAssistant() ? 1 : 0}
      marginBottom={1}
      backgroundColor={cardBg()}
      border={["left"]}
      borderColor={lineColor()}
      paddingLeft={SPINE_CHAT_CARD_CHROME.padL}
      paddingRight={SPINE_CHAT_CARD_CHROME.padR}
      paddingTop={isUser() ? 1 : 0}
      paddingBottom={1}
    >
      {/* Header: glyph + speaker, exceptional live state, elapsed. */}
      <box flexDirection="row" flexShrink={0} alignItems="center" width="100%" gap={1}>
        <box width={railW()} flexShrink={0}>
          <text fg={speakerColor()} wrapMode="none">
            {glyphCell()}
          </text>
        </box>
        <text fg={speakerColor()} wrapMode="none">
          {chrome().speaker}
        </text>
        <Show when={!isUser() && streaming()}>
          <text fg={theme.accent} wrapMode="none">
            live
          </text>
        </Show>
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
