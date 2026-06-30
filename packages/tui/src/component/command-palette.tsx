import { createMemo, createSignal } from "solid-js"
import { DialogSelect, type DialogSelectRef } from "../ui/dialog-select"
import { type DialogContext } from "../ui/dialog"
import {
  COMMAND_PALETTE_COMMAND,
  formatKeyBindings,
  type OpenTuiKeymap,
  useKeymapSelector,
  useOpencodeKeymap,
} from "../keymap"
import { useTuiConfig } from "../config"
import { Glyph } from "../branding"

type PaletteCommandEntry = ReturnType<OpenTuiKeymap["getCommandEntries"]>[number]

function isVisiblePaletteCommand(command: PaletteCommandEntry["command"]) {
  return command.hidden !== true && command.name !== COMMAND_PALETTE_COMMAND
}

function isSuggestedPaletteCommand(entry: PaletteCommandEntry) {
  const suggested = entry.command.suggested
  if (typeof suggested === "boolean") return suggested
  if (typeof suggested === "function") return suggested() === true
  return false
}

export function CommandPaletteDialog() {
  const config = useTuiConfig()
  const keymap = useOpencodeKeymap()
  const entries = useKeymapSelector((keymap: OpenTuiKeymap) => {
    const query = {
      namespace: "palette",
    }
    const reachable = keymap.getCommandEntries({
      ...query,
      visibility: "reachable",
      filter: isVisiblePaletteCommand,
    })
    const registeredBindings = keymap.getCommandBindings({
      visibility: "registered",
      commands: reachable.map((entry) => entry.command.name),
    })

    return reachable.map((entry) => ({
      ...entry,
      bindings: registeredBindings.get(entry.command.name) ?? entry.bindings,
    }))
  })
  const options = createMemo(() =>
    entries().map((entry) => ({
      title: typeof entry.command.title === "string" ? entry.command.title : entry.command.name,
      description: typeof entry.command.desc === "string" ? entry.command.desc : undefined,
      category: typeof entry.command.category === "string" ? entry.command.category : undefined,
      footer: formatKeyBindings(entry.bindings, config),
      value: entry.command.name,
      suggested: isSuggestedPaletteCommand(entry),
      onSelect: (dialog: DialogContext) => {
        dialog.clear()
        keymap.dispatchCommand(entry.command.name)
      },
    })),
  )

  // Keep the option list stable between renders. DialogSelect receives a new
  // `options` array on every render by default, which forces its internal
  // `filtered` memo to re-evaluate continuously. Reading the dialog ref's filter
  // getter inside a memo correctly tracks the dialog's reactive filter state.
  const [ref, setRef] = createSignal<DialogSelectRef<string>>()
  const list = createMemo(() => {
    const filter = ref()?.filter ?? ""
    const base = options()
    if (filter) return base
    const result: ReturnType<typeof options> = []
    for (const option of base) {
      if (option.suggested) {
        result.push({ ...option, value: `suggested:${option.value}`, category: "Suggested" })
      }
    }
    for (const option of base) result.push(option)
    return result
  })

  return <DialogSelect ref={setRef} title={`${Glyph.sigil} commands`} options={list()} />
}
