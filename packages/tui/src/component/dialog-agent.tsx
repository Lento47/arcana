import { createMemo } from "solid-js"
import { Space } from "../ui/chrome"
import { useLocal } from "../context/local"
import { useTheme } from "../context/theme"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { Glyph, COPY } from "../branding"

export function DialogAgent() {
  const local = useLocal()
  const dialog = useDialog()
  const { theme } = useTheme()

  const options = createMemo(() =>
    local.agent.list().map((item) => {
      return {
        value: item.name,
        title: item.name,
        description: item.native ? COPY.dialog.nativeTag : item.description,
      }
    }),
  )

  return (
    <DialogSelect
      title={`${Glyph.sigil} Select Agent`}
      current={local.agent.current()?.name}
      options={options()}
      emptyView={
        <box paddingLeft={Space.insetWide} paddingRight={Space.insetWide} paddingTop={1}>
          <text fg={theme.textMuted}>No agents available.</text>
        </box>
      }
      onSelect={(option) => {
        local.agent.set(option.value)
        dialog.clear()
      }}
    />
  )
}
