import { createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { Glyph } from "../../branding"
import {
  SPINE_CHAT_CARD_CHROME,
  spineRailCell,
  spineRailWidth,
  type SpineKind,
  type SpineLayout,
} from "./spine-types"
import { SpineProse } from "./spine-prose"
import { HairlineBorder } from "../../ui/border"
import type { StreamFrameGate } from "../../util/stream-frame"

/**
 * Conversation voice — one column, one accent line.
 *
 *   [┃][pad 2][ ✦ prose…                                  ]
 *
 * The speaker glyph sits INLINE with the first prose line (a fixed marker
 * cell, not a header row): a lone "✦ + timestamp" line above every message
 * was pure noise in long sessions. Liveness is carried by the stream caret
 * and the composer cue, so no per-message elapsed/timestamp is rendered here.
 *
 * CRITICAL wrap rule: markdown sits in a SINGLE column with an explicit
 * width — never a row whose markdown width is left to percentages. The marker
 * cell is subtracted from the measured content width.
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
  /** Shared session frame gate for streaming prose commits. */
  streamFrame?: StreamFrameGate
}) {
  const { theme } = useTheme()

  const kind = () => props.kind
  const isUser = createMemo(() => kind() === "ask")
  const text = createMemo(() => props.text ?? "")
  const focused = () => props.focused === true
  const speakerColor = createMemo(() => {
    if (isUser()) return theme.spineAsk
    return theme.spineBrand
  })

  const lineColor = createMemo(() => {
    if (focused()) return theme.accent
    return speakerColor()
  })
  const railW = createMemo(() => spineRailWidth(props.layout))
  const accentGlyph = createMemo(() => (isUser() ? Glyph.diamond : Glyph.star))
  const glyphCell = createMemo(() => spineRailCell(accentGlyph(), railW()))
  const markerWidth = createMemo(() => railW() + 1)

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
      return Math.max(1, Math.floor(props.contentWidth) - markerWidth())
    }
    return undefined
  })

  return (
    <box
      flexDirection="row"
      flexShrink={0}
      width="100%"
      minWidth={0}
      marginTop={1}
      marginBottom={0}
      backgroundColor={cardBg()}
      border={["left"]}
      borderColor={lineColor()}
      customBorderChars={HairlineBorder}
      paddingLeft={SPINE_CHAT_CARD_CHROME.padL}
      paddingRight={SPINE_CHAT_CARD_CHROME.padR}
      paddingTop={isUser() ? 1 : 0}
      paddingBottom={1}
    >
      {/* Marker cell — the speaker glyph lines up with the first prose line.
          Quiet Rail: the glyph brightens to the accent on focus (same signal
          as the card hairline), so a selected block reads without a row fill. */}
      <box width={railW()} flexShrink={0} paddingRight={1}>
        <text fg={lineColor()} wrapMode="none">
          {glyphCell()}
        </text>
      </box>

      {/*
        BODY — exact legacy TextPart pattern:
        flexShrink={0} minWidth={0} [explicit width] + markdown.
        NO further rail sibling. Accent is the card left border only.
      */}
      <box
        flexShrink={0}
        minWidth={0}
        width={bodyWidth() ?? ("100%" as any)}
      >
        <SpineProse
          kind={kind()}
          text={text()}
          contentWidth={bodyWidth()}
          bodyLabel={bodyLabel()}
          streaming={props.streaming === true}
          focused={focused()}
          reminders={props.reminders}
          streamFrame={props.streamFrame}
          chatVoice
        />
      </box>
    </box>
  )
}
