import { For, Show } from "solid-js"
import { useTheme } from "../../context/theme"

/**
 * Compact directory / glob listing — plain names, no XML, no code fence, no markdown.
 */
export function SpineListing(props: {
  entries: string[]
  note?: string
  focused?: boolean
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const nameColor = () => (props.focused ? t.text : t.text) as any
  const muted = () => (t.spineDiffMuted ?? t.textMuted) as any

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0} paddingLeft={1}>
      <For each={props.entries}>
        {(name) => (
          <text fg={nameColor()} wrapMode="none">
            {name.endsWith("/") ? (
              <>
                <span style={{ fg: muted() }}>{name.slice(0, -1)}</span>
                <span style={{ fg: muted() }}>/</span>
              </>
            ) : (
              name
            )}
          </text>
        )}
      </For>
      <Show when={props.note?.trim()}>
        <text fg={muted()} wrapMode="word">
          {props.note!.trim()}
        </text>
      </Show>
    </box>
  )
}
