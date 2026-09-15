import { DialogPrompt } from "../ui/dialog-prompt"
import { useDialog } from "../ui/dialog"
import { useSync } from "../context/sync"
import { createMemo, createSignal } from "solid-js"
import { useSDK } from "../context/sdk"
import { Glyph } from "../branding"
import { useToast } from "../ui/toast"
import { errorMessage } from "../util/error"

interface DialogSessionRenameProps {
  session: string
}

export function DialogSessionRename(props: DialogSessionRenameProps) {
  const dialog = useDialog()
  const sync = useSync()
  const sdk = useSDK()
  const toast = useToast()
  const session = createMemo(() => sync.session.get(props.session))
  const [busy, setBusy] = createSignal(false)

  const validate = (value: string): string | undefined => {
    const trimmed = value.trim()
    if (!trimmed) return "Enter a session name."
    if (trimmed.length > 200) return "Shorten the session name to 200 characters or fewer."
    return undefined
  }

  const handleConfirm = async (value: string) => {
    const err = validate(value)
    if (err) { toast.show({ message: err, variant: "error" }); return }

    setBusy(true)
    try {
      const { error } = await sdk.client.session.update({
        sessionID: props.session,
        title: value.trim(),
      })
      if (error) {
        toast.show({
          message: `${errorMessage(error)} — try again.`,
          variant: "error",
        })
        setBusy(false)
        return
      }
      toast.show({ message: "Session renamed.", variant: "success" })
      dialog.clear()
    } catch (e) {
      toast.show({
        message: e instanceof Error ? `${e.message} — try again.` : "Failed to rename session — try again.",
        variant: "error",
      })
      setBusy(false)
    }
  }

  return (
    <DialogPrompt
      title={`${Glyph.sigil} Rename Session`}
      value={session()?.title}
      busy={busy()}
      busyText="Renaming…"
      onConfirm={handleConfirm}
      onCancel={() => dialog.clear()}
    />
  )
}
