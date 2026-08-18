import { createSignal, Show } from "solid-js"
import { Global } from "@arcana/core/global"
import { useDialog } from "../ui/dialog"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useToast } from "../ui/toast"
import { Glyph } from "../branding"
import { soulFilePath } from "../util/config-edit"
import { readText, writeText } from "../util/persistence"
import { createEffect } from "solid-js"

/**
 * Personal instructions — the global SOUL.md the engine appends to every
 * session's system prompt (like ChatGPT custom instructions). Lives in the
 * global config dir (~/.config/arcana/SOUL.md) so it applies across projects.
 */
export function DialogSoul() {
  const dialog = useDialog()
  const toast = useToast()
  const [content, setContent] = createSignal<string | undefined>(undefined)
  const [saving, setSaving] = createSignal(false)

  const filePath = () => soulFilePath(Global.Path.config)

  createEffect(() => {
    if (content() !== undefined) return
    void readText(filePath())
      .then((text) => setContent(text))
      .catch(() => setContent(""))
  })

  const handleSave = async (value: string) => {
    setSaving(true)
    try {
      await writeText(filePath(), value)
      toast.show({ message: "Personal instructions saved — applies to the next turn.", variant: "success" })
      dialog.clear()
    } catch (error) {
      toast.show({ message: error instanceof Error ? error.message : "Failed to save", variant: "error" })
      setSaving(false)
    }
  }

  return (
    <Show when={content() !== undefined}>
      <DialogPrompt
        title={`${Glyph.sigil} Personal instructions`}
        description="Appended to every session's system prompt. Leave empty to remove."
        value={content() ?? ""}
        height={8}
        busy={saving()}
        busyText="Saving..."
        onConfirm={handleSave}
        onCancel={() => dialog.clear()}
      />
    </Show>
  )
}
