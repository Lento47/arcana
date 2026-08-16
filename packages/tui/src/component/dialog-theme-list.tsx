import { DialogSelect, type DialogSelectRef } from "../ui/dialog-select"
import { useTheme } from "../context/theme"
import { Glyph } from "../branding"
import { useDialog } from "../ui/dialog"
import { onCleanup } from "solid-js"

export function DialogThemeList() {
  const theme = useTheme()
  const mode = () => (theme.mode() === "dark" ? "Dark" : "Light")
  const modeAction = () => (theme.mode() === "dark" ? "Switch to light" : "Switch to dark")
  const lockAction = () => (theme.locked() ? "Unlock mode" : "Lock mode")
  const options = Object.keys(theme.all())
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((value) => ({
      title: value,
      value: value,
    }))
  const dialog = useDialog()
  let confirmed = false
  let ref: DialogSelectRef<string>
  const initial = theme.selected

  onCleanup(() => {
    if (!confirmed) theme.set(initial)
  })

  return (
    <DialogSelect
      title={`${Glyph.sigil} Themes`}
      footer={
        <text fg={theme.theme.textMuted}>
          {mode()} mode{theme.locked() ? " · locked" : " · following terminal"}
        </text>
      }
      options={options}
      current={initial}
      onMove={(opt) => {
        theme.set(opt.value)
      }}
      onSelect={(opt) => {
        theme.set(opt.value)
        confirmed = true
        dialog.clear()
      }}
      ref={(r) => {
        ref = r
      }}
      onFilter={(query) => {
        if (query.length === 0) {
          theme.set(initial)
          return
        }

        const first = ref.filtered[0]
        if (first) theme.set(first.value)
      }}
      actions={[
        {
          command: "theme.switch_mode",
          title: modeAction(),
          onTrigger: () => theme.setMode(theme.mode() === "dark" ? "light" : "dark"),
        },
        {
          command: "theme.mode.lock",
          title: lockAction(),
          onTrigger: () => {
            if (theme.locked()) theme.unlock()
            else theme.lock()
          },
        },
      ]}
    />
  )
}
