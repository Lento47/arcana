import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { createResource, createMemo, createSignal, Show } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { Glyph } from "../branding"
import { Spinner } from "./spinner"
import { errorMessage } from "../util/error"

export type DialogSkillProps = {
  onSelect: (skill: string) => void
}

export function DialogSkill(props: DialogSkillProps) {
  const dialog = useDialog()
  const sdk = useSDK()
  const { theme } = useTheme()
  const [loadError, setLoadError] = createSignal<unknown>()
  dialog.setSize("large")

  const [skills] = createResource(async () => {
    const result = await sdk.client.app.skills()
    if (result.error) {
      setLoadError(result.error)
      return []
    }
    setLoadError(undefined)
    return result.data ?? []
  })

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const list = skills() ?? []
    // Reduce instead of a spread so a large skill catalog can't overflow the
    // argument stack while measuring name widths.
    const maxWidth = list.reduce((max, skill) => Math.max(max, skill.name.length), 0)
    return list.map((skill) => ({
      title: skill.name.padEnd(maxWidth),
      description: skill.description?.replace(/\s+/g, " ").trim(),
      value: skill.name,
      category: "Skills",
      onSelect: () => {
        props.onSelect(skill.name)
        dialog.clear()
      },
    }))
  })

  return (
    <DialogSelect
      title={`${Glyph.sigil} Skills`}
      placeholder="Search skills…"
      options={options()}
      emptyView={
        <Show
          when={skills.loading}
          fallback={
            <box paddingLeft={4} paddingRight={4} paddingTop={1}>
              <text fg={loadError() ? theme.error : theme.textMuted}>
                {loadError()
                  ? `Failed to load skills — ${errorMessage(loadError())}. Press Esc and reopen to retry.`
                  : "No skills found."}
              </text>
            </box>
          }
        >
          <box paddingLeft={4} paddingRight={4} paddingTop={1} flexDirection="row" gap={1}>
            <Spinner />
            <text fg={theme.textMuted}>Loading skills…</text>
          </box>
        </Show>
      }
    />
  )
}
