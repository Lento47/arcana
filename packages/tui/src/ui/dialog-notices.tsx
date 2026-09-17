import { For, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { Glyph, StatusGlyph } from "../branding"
import { Space } from "./chrome"
import { useTheme } from "../context/theme"
import { Locale } from "../util/locale"
import { useBindings } from "../keymap"
import { useDialog } from "./dialog"
import { useToast, type Notice } from "./toast"
import { DialogButton, DialogColumn, DialogFooter, DialogTitleRow } from "./dialog-chrome"

/**
 * The notice tray.
 *
 * Toasts are ephemeral by design — a card that lingers is a nag — but the
 * information in them is not: "Update failed", "Compaction failed", "Predictor
 * disabled" are things the operator may only notice ten seconds later, after
 * the card is gone and before the transcript says anything about it. The tray
 * is where notices go to be *found again*: newest first, repeats collapsed with
 * a count, everything else exactly as it was drawn.
 */
export function DialogNotices() {
  const dialog = useDialog()
  const toast = useToast()
  const { theme } = useTheme()

  useBindings(() => ({
    bindings: [
      {
        key: "c",
        desc: "Clear notices",
        group: "Dialog",
        cmd: () => toast.clearNotices(),
      },
      { key: "escape", desc: "Close notices", group: "Dialog", cmd: () => dialog.clear() },
    ],
  }))

  /** Newest first: the tray answers "what just happened", not "what happened first". */
  const newestFirst = () => toast.notices.toReversed()

  return (
    <DialogColumn padBottom>
      <DialogTitleRow
        title={toast.notices.length > 0 ? `Notices · ${toast.notices.length}` : "Notices"}
        onClose={() => dialog.clear()}
      />

      <Show
        when={toast.notices.length > 0}
        fallback={<text fg={theme.textMuted}>No notices yet — toasts collect here after they fade.</text>}
      >
        <box flexDirection="column" gap={Space.gap} minWidth={0}>
          <For each={newestFirst()}>
            {(item) => (
              <NoticeRow item={item} />
            )}
          </For>
        </box>
      </Show>

      <DialogFooter>
        <DialogButton label="[c] clear" onPress={() => toast.clearNotices()} />
      </DialogFooter>
    </DialogColumn>
  )
}

/**
 * One notice. The mark carries the variant in shape (so the row still reads
 * without color), the timestamp is fixed width so the messages align as a
 * column, and the count only appears when the same notice repeated.
 */
function NoticeRow(props: { item: Notice }) {
  const { theme } = useTheme()
  const mark = () => {
    if (props.item.variant === "error") return StatusGlyph.failed
    if (props.item.variant === "warning") return Glyph.warn
    if (props.item.variant === "success") return StatusGlyph.done
    return Glyph.dot
  }
  return (
    <box flexDirection="row" gap={Space.gap} minWidth={0}>
      <text fg={theme.textMuted} flexShrink={0} wrapMode="none">
        {Locale.time(props.item.at)}
      </text>
      <text fg={theme[props.item.variant]} flexShrink={0} wrapMode="none">
        {mark()}
      </text>
      <text fg={theme.text} flexShrink={1} minWidth={0} wrapMode="word">
        <Show when={props.item.title}>
          {(title) => <span style={{ attributes: TextAttributes.BOLD }}>{title()} </span>}
        </Show>
        {props.item.message}
      </text>
      <Show when={props.item.count > 1}>
        <text fg={theme.textMuted} flexShrink={0} wrapMode="none">
          {Glyph.repeat}{props.item.count}
        </text>
      </Show>
    </box>
  )
}
