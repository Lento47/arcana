import { createMemo, createResource, createSignal, Show } from "solid-js"
import { Space } from "../ui/chrome"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useProject } from "../context/project"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { createStore } from "solid-js/store"
import { Glyph } from "../branding"
import { errorMessage } from "../util/error"

export function DialogTag(props: { onSelect?: (value: string) => void }) {
  const sdk = useSDK()
  const dialog = useDialog()
  const project = useProject()
  const { theme } = useTheme()
  const [loadError, setLoadError] = createSignal<unknown>()

  const [store] = createStore({
    filter: "",
  })

  const [files] = createResource(
    () => [store.filter],
    async () => {
      try {
        const result = await sdk.client.find.files({
          query: store.filter,
          workspace: project.workspace.current(),
        })
        if (result.error) {
          setLoadError(result.error)
          return []
        }
        setLoadError(undefined)
        const sliced = (result.data ?? []).slice(0, 5)
        return sliced
      } catch (error) {
        setLoadError(error)
        return []
      }
    },
  )

  const options = createMemo(() =>
    (files() ?? []).map((file) => ({
      value: file,
      title: file,
    })),
  )

  return (
    <DialogSelect
      title={`${Glyph.sigil} Autocomplete`}
      options={options()}
      emptyView={
        <Show
          when={loadError()}
          fallback={
            <box paddingLeft={Space.insetWide} paddingRight={Space.insetWide} paddingTop={Space.padY}>
              <text fg={theme.textMuted}>
                {files.loading
                  ? "Searching files…"
                  : store.filter
                    ? "No matching files — try a shorter query."
                    : "Type to search files."}
              </text>
            </box>
          }
        >
          <box paddingLeft={Space.insetWide} paddingRight={Space.insetWide} paddingTop={Space.padY}>
            <text fg={theme.error}>
              Failed to search files — {errorMessage(loadError())}. Keep typing to retry.
            </text>
          </box>
        </Show>
      }
      onSelect={(option) => {
        props.onSelect?.(option.value)
        dialog.clear()
      }}
    />
  )
}
