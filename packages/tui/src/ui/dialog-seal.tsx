import { For, onMount } from "solid-js"
import { useTheme } from "../context/theme"
import { useToast } from "./toast"
import { useClipboard } from "../context/clipboard"
import { useDialog } from "./dialog"
import { Space } from "./chrome"
import { Card } from "./kit/card"
import { Digits } from "./kit/digits-view"
import { DialogButton, DialogColumn, DialogFooter, DialogTitleRow } from "./dialog-chrome"

/**
 * The seal card: headline numbers as block digits over the receipt text, with
 * a copy action. The receipt itself stayed the same — this is the artifact
 * view of it.
 */
export function DialogSeal(props: {
  seal: string
  digits: ReadonlyArray<{ label: string; value: string }>
}) {
  const dialog = useDialog()
  const toast = useToast()
  const clipboard = useClipboard()
  const { theme } = useTheme()
  onMount(() => dialog.setSize("large"))

  return (
    <DialogColumn padBottom>
      <DialogTitleRow title="Seal" onClose={() => dialog.clear()} />
      <Card title="SESSION SEAL">
        <box flexDirection="row" gap={Space.insetWide} minWidth={0}>
          <For each={props.digits}>
            {(digit) => (
              <box flexDirection="column" minWidth={0}>
                <Digits text={digit.value} fg={theme.accent} />
                <text fg={theme.textMuted} wrapMode="none">
                  {digit.label}
                </text>
              </box>
            )}
          </For>
        </box>
        <box flexDirection="column" paddingTop={Space.padY} minWidth={0}>
          <For each={props.seal.split("\n")}>
            {(line) => (
              <text fg={theme.spineContext} wrapMode="none">
                {line}
              </text>
            )}
          </For>
        </box>
      </Card>
      <DialogFooter>
        <DialogButton
          label="[c] copy"
          onPress={async () => {
            try {
              await clipboard.write?.(props.seal)
              toast.show({ message: "Session seal copied to clipboard", variant: "success" })
            } catch {
              toast.show({ message: "Failed to copy the seal — try again", variant: "error" })
            }
          }}
        />
      </DialogFooter>
    </DialogColumn>
  )
}
