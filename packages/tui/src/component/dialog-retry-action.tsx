import { RGBA, TextAttributes } from "@opentui/core"
import open from "open"
import { createMemo, createSignal, Show } from "solid-js"
import { useRenderer } from "@opentui/solid"
import { selectedForeground, useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "../ui/dialog"
import { OVERLAY_ALPHA, withAlpha } from "../theme/emphasis"
import { useKV } from "../context/kv"
import { Link } from "../ui/link"
import { BgPulse } from "./bg-pulse"
import { useBindings } from "../keymap"
import { DialogCloseHint } from "../ui/dialog-chrome"
import { Space } from "../ui/chrome"
import { COPY } from "../branding"
import { Locale } from "../util/locale"
import { useTerminalSize } from "../util/terminal-size"
import { dialogMaxWidth, dialogWidth } from "../util/geometry"

const GO_URL = "https://arcana.otnelhq.com/go"
/** Bleed for the decorative pulse behind the card, in rows. */
const PAD_TOP_OUTER = 1
/**
 * The card's own chrome, taken off the dialog's width to get the row's: the
 * card's border, and the two columns of padding this component puts inside it.
 */
const CARD_CHROME = 2 + Space.padX * 2
/** A button is its label plus the padding either side of it. */
const buttonWidth = (label: string) => Space.padX * 2 + Locale.displayWidth(label)

export type DialogRetryActionProps = {
  title: string
  message: string
  label: string
  link?: string
  onClose?: (dontShowAgain?: boolean) => void
}

function runAction(props: DialogRetryActionProps, dialog: ReturnType<typeof useDialog>) {
  if (props.link) open(props.link).catch(() => {})
  props.onClose?.()
  dialog.clear()
}

function dismiss(props: DialogRetryActionProps, dialog: ReturnType<typeof useDialog>) {
  props.onClose?.(true)
  dialog.clear()
}

/** Card-colored panel at the shared overlay alpha — see `theme/emphasis`. */
function panelOverlay(color: RGBA) {
  return withAlpha(color, OVERLAY_ALPHA)
}

export function DialogRetryAction(props: DialogRetryActionProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const kv = useKV()
  const term = useTerminalSize(useRenderer())
  const fg = selectedForeground(theme)
  const showGoTreatment = () => props.link === GO_URL
  const textBg = () => (showGoTreatment() ? panelOverlay(theme.backgroundPanel) : undefined)
  // The pulse is decorative; the global animations_enabled KV disables it.
  const motionEnabled = () => showGoTreatment() && kv.get("animations_enabled", true)
  const inactiveBg = createMemo(() => textBg() ?? (theme.background.a < 1 ? theme.backgroundPanel : theme.background))
  const [selected, setSelected] = createSignal<"dismiss" | "action">("action")

  /**
   * Whether the two buttons fit on one row, measured from the dialog's own
   * geometry rather than from the terminal: the card is the medium default
   * unless a caller resized it, and the row's room is that width less the
   * card's chrome. Unmeasured (`width === 0`, before the first layout) is not
   * narrow — a card that starts stacked and then reflows is a visible jump.
   *
   * Stacked is the honest answer below the pair's width. Inline, one of the two
   * has to give, and the one that goes is the action: the row would rather drop
   * `Retry` to its own row than spell it wrongly.
   */
  const stacks = createMemo(() => {
    const width = term().width
    if (width === 0) return false
    const card = Math.max(1, Math.min(dialogWidth(width, "medium"), dialogMaxWidth(width)))
    return card - CARD_CHROME < buttonWidth(COPY.dialog.dontShowAgain) + buttonWidth(props.label)
  })

  useBindings(() => ({
    bindings: [
      {
        key: "left",
        desc: "Previous retry option",
        group: "Dialog",
        cmd: () => setSelected((value) => (value === "action" ? "dismiss" : "action")),
      },
      {
        key: "right",
        desc: "Next retry option",
        group: "Dialog",
        cmd: () => setSelected((value) => (value === "action" ? "dismiss" : "action")),
      },
      {
        key: "tab",
        desc: "Next retry option",
        group: "Dialog",
        cmd: () => setSelected((value) => (value === "action" ? "dismiss" : "action")),
      },
      {
        key: "return",
        desc: "Confirm retry option",
        group: "Dialog",
        cmd: () => {
          if (selected() === "action") runAction(props, dialog)
          else dismiss(props, dialog)
        },
      },
    ],
  }))

  return (
    <box>
      <Show when={motionEnabled()}>
        <box position="absolute" top={-PAD_TOP_OUTER} left={0} right={0} bottom={0} zIndex={0}>
          <BgPulse />
        </box>
      </Show>
      <box zIndex={1} paddingLeft={Space.padX} paddingRight={Space.padX} paddingBottom={Space.padY} gap={Space.gap}>
        <box flexDirection="row" justifyContent="space-between">
          {/* The title yields, the dismissal does not — the shape of every other
              dialog's title row (`ui/dialog-chrome.tsx`): a title that wraps to a
              second row makes the card jump between one and two rows tall, while
              a title that clips keeps the row it was given. */}
          <text
            attributes={TextAttributes.BOLD}
            fg={theme.text}
            bg={textBg()}
            flexShrink={1}
            overflow="hidden"
            wrapMode="none"
          >
            {props.title}
          </text>
          <DialogCloseHint onClose={() => dialog.clear()} label={COPY.dialog.dismiss} background={textBg()} />
        </box>
        <box gap={0}>
          <text fg={theme.textMuted} bg={textBg()} wrapMode="word">
            {props.message}
          </text>
        </box>
        {props.link ? (
          showGoTreatment() ? (
            <box alignItems="center" justifyContent="flex-end" height={7} paddingBottom={1}>
              <Link href={props.link} fg={theme.primary} bg={textBg()} wrapMode="none" />
            </box>
          ) : (
            <box width="100%" flexDirection="row" justifyContent="center" paddingBottom={1}>
              <Link href={props.link} fg={theme.primary} wrapMode="none" />
            </box>
          )
        ) : (
          <box paddingBottom={1} />
        )}
        <box
          flexDirection={stacks() ? "column" : "row"}
          justifyContent={stacks() ? "flex-end" : "space-between"}
          alignItems={stacks() ? "flex-end" : undefined}
          gap={stacks() ? 1 : 0}
        >
          {/* Two buttons, both fixed vocabulary, both the whole of what they say
              — `Don't Show Again` and the action verb. Neither is elastic: a row
              too narrow for both puts the action on its own row instead, so the
              worst case is a taller card rather than a button that no longer
              reads as the thing you are about to press. */}
          <box
            flexShrink={0}
            paddingLeft={Space.padX}
            paddingRight={Space.padX}
            backgroundColor={selected() === "dismiss" ? theme.primary : inactiveBg()}
            onMouseOver={() => setSelected("dismiss")}
            onMouseUp={() => dismiss(props, dialog)}
          >
            <text
              fg={selected() === "dismiss" ? fg : theme.textMuted}
              bg={selected() === "dismiss" ? undefined : textBg()}
              attributes={selected() === "dismiss" ? TextAttributes.BOLD : undefined}
              wrapMode="none"
            >
              {COPY.dialog.dontShowAgain}
            </text>
          </box>
          <box
            flexShrink={0}
            paddingLeft={Space.padX}
            paddingRight={Space.padX}
            backgroundColor={selected() === "action" ? theme.primary : inactiveBg()}
            onMouseOver={() => setSelected("action")}
            onMouseUp={() => runAction(props, dialog)}
          >
            <text
              fg={selected() === "action" ? fg : theme.text}
              bg={selected() === "action" ? undefined : textBg()}
              attributes={selected() === "action" ? TextAttributes.BOLD : undefined}
              wrapMode="none"
            >
              {props.label}
            </text>
          </box>
        </box>
      </box>
    </box>
  )
}

DialogRetryAction.show = (
  dialog: DialogContext,
  props: Pick<DialogRetryActionProps, "title" | "message" | "label" | "link">,
) => {
  return new Promise<boolean>((resolve) => {
    // Render and replace are wrapped in try/catch so a thrown render never
    // strands the awaiting Promise unresolved. Without this, a faulty
    // dialog could block retry policy for the rest of the session.
    try {
      dialog.replace(
        () => <DialogRetryAction {...props} onClose={(dontShow) => resolve(dontShow ?? false)} />,
        () => resolve(false),
      )
    } catch (err) {
      console.error("DialogRetryAction.show render failed:", err)
      resolve(false)
    }
  })
}
