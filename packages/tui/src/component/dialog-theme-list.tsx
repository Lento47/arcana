import { createMemo, onCleanup } from "solid-js"
import { DialogSelect, type DialogSelectRef } from "../ui/dialog-select"
import { useTheme } from "../context/theme"
import { Glyph } from "../branding"
import { resolveTheme, themeCharacter } from "../theme"
import { useDialog } from "../ui/dialog"

export function DialogThemeList() {
  const theme = useTheme()
  const mode = () => (theme.mode() === "dark" ? "Dark" : "Light")
  const modeAction = () => (theme.mode() === "dark" ? "Switch to Light" : "Switch to Dark")
  const lockAction = () => (theme.locked() ? "Unlock Mode" : "Lock Mode")
  // A swatch (surface · ink · identity) rendered inline before the name, so a
  // row can be judged without moving onto it. Colors are resolved with the
  // effective mono mode and the current light/dark mode — what the theme will
  // actually look like when selected. The title stays plain text so filtering
  // still matches on the theme name.
  const options = createMemo(() =>
    Object.entries(theme.all())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map(([value, themeJson]) => {
        const resolved = resolveTheme(themeJson, theme.mode(), { mono: theme.mono() })
        return {
          title: value,
          value,
          titleView: (
            <>
              <span style={{ bg: resolved.background }}>{"  "}</span>
              <span style={{ bg: resolved.text }}>{"  "}</span>
              <span style={{ bg: resolved.accent }}>{"  "}</span>
              {"  "}
              {value}
            </>
          ),
          description: themeCharacter(value, themeJson),
        }
      }),
  )
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
          {mode()} mode · mono {theme.mono()}
          {theme.locked() ? " · locked" : " · following terminal"}
        </text>
      }
      options={options()}
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
          command: "theme.mono",
          title: `Mono: ${theme.mono()}`,
          onTrigger: () => {
            const order = ["full", "soft", "off"] as const
            const next = order[(order.indexOf(theme.mono()) + 1) % order.length]!
            theme.setMono(next)
          },
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
