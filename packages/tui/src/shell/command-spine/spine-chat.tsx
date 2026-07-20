import { Show } from "solid-js"
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
 */
export function SpineChatCard(props: {
  kind: SpineKind
  label?: string
  text: string
  layout: SpineLayout
  elapsed?: string
  streaming?: boolean
  focused?: boolean
  reminders?: string[]
  bodyLabel?: string
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>

  const isUser = () => props.kind === "ask"
  const isAssistant = () => props.kind === "plan" || props.kind === "ok"

  const speaker = () => {
    if (isUser()) return "you"
    const raw = (props.label ?? "").trim().toLowerCase()
    if (raw && raw !== "assistant" && raw !== "plan" && raw !== "ok" && raw !== "coda" && raw !== "insight") {
      return raw
    }
    return APP_NAME
  }

  const glyph = () => {
    if (isUser()) return Glyph.diamond
    return Glyph.star
  }

  const speakerColor = () => {
    if (isUser()) return (t.spineAsk ?? t.accent ?? spineTone("ask", t)) as any
    return (t.spineBrand ?? t.primary ?? t.spineOk ?? spineTone("ok", t)) as any
  }

  const railColor = () => speakerColor()
  const elapsedText = compactSpineElapsed(props.elapsed, spineElapsedMax(props.layout))

  // Soft card behind assistant prose; user stays on the page background (sticky-header style).
  const cardBg = () => {
    if (!isAssistant()) return undefined
    if (props.focused) return (t.backgroundElement ?? t.backgroundPanel) as any
    return (t.backgroundPanel ?? t.backgroundElement) as any
  }

  return (
    <box
      flexDirection="row"
      flexShrink={0}
      alignItems="flex-start"
      marginTop={isAssistant() ? 1 : 0}
      marginBottom={1}
    >
      <SpineRail
        layout={props.layout}
        kind={props.kind}
        glyph={glyph()}
        color={railColor()}
        active={props.focused}
      />
      <box
        flexGrow={1}
        minWidth={0}
        flexShrink={1}
        flexDirection="column"
        backgroundColor={cardBg()}
        border={isAssistant() ? ["left"] : undefined}
        borderColor={isAssistant() ? railColor() : undefined}
        paddingLeft={isAssistant() ? 2 : 1}
        paddingRight={1}
        paddingTop={isAssistant() ? 1 : 0}
        paddingBottom={isAssistant() ? 1 : 0}
      >
        {/* Speaker line — product voice, not a tool verb column */}
        <box flexDirection="row" flexShrink={0} alignItems="center" gap={1}>
          <text fg={speakerColor()} wrapMode="none">
            {speaker()}
          </text>
          <Show when={props.streaming}>
            <SigilSpinner color={speakerColor()} />
          </Show>
          <Show when={props.streaming && !elapsedText}>
            <ShimmerText text="writing" active={true} background={(cardBg() ?? t.background) as any} />
          </Show>
          <Show when={elapsedText}>
            <text fg={(t.spineGutterElapsed ?? t.textMuted) as any} wrapMode="none">
              {elapsedText}
            </text>
          </Show>
        </box>

        {/* Full markdown body — primary reading surface */}
        <box flexGrow={1} minWidth={0} flexShrink={1} marginTop={1}>
          <SpineProse
            kind={props.kind}
            text={props.text}
            bodyLabel={props.bodyLabel ?? (isUser() ? "prompt" : "assistant")}
            streaming={props.streaming}
            focused={props.focused}
            reminders={props.reminders}
            chatVoice
          />
        </box>
      </box>
    </box>
  )
}
